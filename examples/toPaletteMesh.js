const fsExtra = require('fs-extra');
const path = require('path');
const processGltf = require('gltf-pipeline').processGltf;

/* Import our custom pipeline stage */
const toPaletteMesh = require(path.join(__dirname, '..', 'toPaletteMesh'))

fsExtra.readJson(path.join(__dirname, 'toPaletteMesh.gltf'))
    .then(gltf => {
        return processGltf(gltf, {customStages: toPaletteMesh});
    })
    .then(result => {
        fsExtra.writeJsonSync('output.gltf', result.gltf)
    })
    .catch(console.error);
