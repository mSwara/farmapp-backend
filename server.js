const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const ee = require('@google/earthengine');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000; // Railway assigns its own port

app.use(bodyParser.json());
app.use(cors());

// --- Authenticate with GEE using environment variable ---
const privateKey = JSON.parse(process.env.GEE_KEY);

ee.data.authenticateViaPrivateKey(privateKey, () => {
    console.log('✅ GEE Authentication successful');
    ee.initialize();
}, (err) => {
    console.error('❌ GEE Authentication failed', err);
});

// --- Endpoint to check if a polygon is farmland or forest ---
app.post('/check-farm', async (req, res) => {
    try {
        const coords = req.body.coordinates;
        if (!coords || coords.length < 3) {
            return res.status(400).json({ error: "Invalid coordinates" });
        }

        const polygon = ee.Geometry.Polygon([coords]);
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
                return res.status(500).json({ error: 'GEE processing error' });
            }

            const classes = {
                10: 'cropland',
                20: 'forest',
                30: 'shrubland',
                40: 'grassland',
                50: 'wetland',
                60: 'water',
                70: 'built-up',
                80: 'bare/sparse vegetation',
                90: 'snow/ice'
            };

            const landType = classes[value] || 'unknown';

            if (value === 10 || value === 20) {
                // cropland or forest — calculate area
                polygon.area().getInfo((areaSqMeters) => {
                    const areaAcres = areaSqMeters * 0.000247105;
                    res.json({
                        farm: value === 10,
                        forest: value === 20,
                        type: landType,
                        areaSqMeters,
                        areaAcres
                    });
                });
            } else {
                res.json({
                    farm: false,
                    forest: false,
                    type: landType,
                    message: 'Selected area is not cropland or forest.'
                });
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.listen(PORT, () => {
    console.log(`🌱 Backend running on port ${PORT}`);
});
