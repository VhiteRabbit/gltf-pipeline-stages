const fsExtra = require('fs-extra');
const path = require('path');
const processGltf = require('gltf-pipeline').processGltf;

/* Import our custom pipeline stage */
const textureAtlas = require(path.join(__dirname, '..', 'textureAtlas'));

fsExtra.readJson(path.join(__dirname, 'textureAtlas.gltf'))
    .then(gltf => {
        return processGltf(gltf, {customStages: textureAtlas, atlases: {
            "tv-table-atlas": ["Plant 1", "Vase 0", "Vase Blue 2", "Device", "Plant Small 1", "Platonic", "Stand"],
            "bookshelf-atlas": ["Books 3","Books 4", "Vase 3", "Shelves", "Frame 7.1", "Frame 6.1", "Candles", "Vase Black"]
        }});
    })
    .then(result => {
        fsExtra.writeJsonSync('output.gltf', result.gltf)
    })
    .catch(e => {
        console.error(e);
        e.printStackTrace();
    });
