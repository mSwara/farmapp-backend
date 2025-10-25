const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const ee = require('@google/earthengine');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(cors());

// Authenticate with GEE using service account
const KEY_PATH = path.join(__dirname, 'gee-key.json');
const privateKey = require(KEY_PATH);

ee.data.authenticateViaPrivateKey(privateKey, () => {
    console.log('✅ GEE Authentication successful');
    ee.initialize();
}, (err) => {
    console.error('❌ GEE Authentication failed', err);
});

// Endpoint to check if a polygon is farm field
app.post('/check-farm', async (req, res) => {
    try {
        const coords = req.body.coordinates; // [[lat, lon], [lat, lon], ...]
        if (!coords || coords.length < 3) {
            return res.status(400).json({error: "Invalid coordinates"});
        }

        const polygon = ee.Geometry.Polygon([coords]);

        // Use ESA WorldCover 2020 dataset
        const landcover = ee.Image('ESA/WorldCover/v100/2020').clip(polygon);

        const mode = landcover.reduceRegion({
            reducer: ee.Reducer.mode(),
            geometry: polygon,
            scale: 10,
            maxPixels: 1e9
        }).get('Map');

        mode.evaluate((value, err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({error: 'GEE processing error'});
            }

            /*
            WorldCover classes: 
            10 = cropland
            20 = forest
            30 = shrubland
            40 = grassland
            50 = wetland
            60 = water
            70 = built-up
            80 = bare/sparse vegetation
            90 = snow/ice
            */

            if (value === 10) {
                // It is cropland → calculate area
                polygon.area().getInfo((areaSqMeters) => {
                    const areaAcres = areaSqMeters * 0.000247105;
                    res.json({
                        farm: true,
                        areaSqMeters: areaSqMeters,
                        areaAcres: areaAcres
                    });
                });
            } else {
                // Not cropland
                res.json({
                    farm: false,
                    message: 'Selected area is not a farm field.'
                });
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({error: 'Server error'});
    }
});

app.listen(PORT, () => {
    console.log(`🌱 Backend running on http://localhost:${PORT}`);
});
