const PNG = require('pngjs').PNG;
const Buffer = require('buffer').Buffer;

const lib = './node_modules/gltf-pipeline/lib/';
const ForEach = require(lib + 'ForEach');
const addBuffer = require(lib + 'addBuffer');
const readAccessorPacked = require(lib + 'readAccessorPacked');
const findAccessorMinMax = require(lib + 'findAccessorMinMax');
const getBufferPadded = require(lib + 'getBufferPadded');
const removeUnusedElements = require(lib + 'removeUnusedElements');

const mat4 = require('gl-matrix').mat4;
const vec3 = require('gl-matrix').vec3;

module.exports = toPaletteMesh;

PALETTE = []

/**
 * Add a color to the palette
 *
 * @private
 */
function addToPalette(color) {
    const index = PALETTE.find(c => {
        for(var i = 0; i < 4; ++i) {
            if(color[i] != c[i]) return false;
        }
        return true;
    });

    if(index == undefined) {
        /* Color not in palette yet */
        PALETTE.push(color);
        return PALETTE.length - 1;
    } else {
        return index;
    }
}

/** Get next power of two larger than given number */
function getNextPowerOf2(val) {
    return Math.pow(2, Math.ceil(Math.log2(val)));
}

/**
 * Save palette as png image.
 */
function paletteToImage() {
    var png = new PNG({
        width: getNextPowerOf2(PALETTE.length),
        height: 1
    });

    var i = 0;
    PALETTE.forEach(function(color) {
        for(var c = 0; c < 4; ++c) {
            png.data[i++] = (color[c] || 1)*255;
        }
    });

    console.log(`Palette (1 x ${png.width}) size is ${png.data.length} bytes with ${PALETTE.length} colors`);
    var data = PNG.sync.write(png, {});
    return data;
}

/** Add min and max to accessor */
function addMinMax(gltf, accessorId) {
    var accessor = gltf.accessors[accessorId];
    minMax = findAccessorMinMax(gltf, accessor);
    accessor.min = minMax.min;
    accessor.max = minMax.max;
}

/** Find first node which has given node as a child */
function findParentNode(gltf, node) {
    return gltf.nodes.find(n => (n.children || []).includes(node));
}

function nodeIsEmpty(node) {
    /* If self is empty and has only empty children, node is empty */
    if(!(node.mesh || node.camera || node.extensions)) {
        return !(node.children
            && node.children
                .map(n => gltf.nodes[n])
                .filter(nodeIsEmpty));
    }
    return false;
}

function removeUnusedMeshes(gltf) {
    var referenced = new Array(gltf.meshes.length);
    gltf.nodes.forEach((n, i) => {
        if(n.mesh) {
            referenced[n.mesh] = true;
        }
    });

    var meshesToRemove = [];
    gltf.meshes.forEach((r, i) => {
        if(!referenced[i]) {
            meshesToRemove.push(i);
        }
    });

    meshesToRemove.reverse().forEach(i => {
        delete gltf.meshes[i];
        gltf.nodes.forEach(n => {
            if(n.mesh && n.mesh > i) --n.mesh;
        });
    });

    gltf.meshes = gltf.meshes.filter(x => !!x);

    return gltf;
}

function removeUnusedMaterials(gltf) {
    var referenced = new Array(gltf.materials.length);
    gltf.meshes.forEach((m, i) => {
        m.primitives.forEach((p, i) => {
            referenced[p.material] = true;
        });
    });

    var materialsToRemove = [];
    gltf.materials.forEach((r, i) => {
        if(!referenced[i]) {
            materialsToRemove.push(i);
        }
    });

    materialsToRemove.reverse().forEach(i => {
        delete gltf.materials[i];
        gltf.meshes.forEach((m, j) => {
            m.primitives.forEach(p => {
                if(p.material > i) --p.material;
            });
        });
    });

    gltf.materials = gltf.materials.filter(x => !!x);
    return gltf;
}

function removeUnusedNodes(gltf) {
    var parents = new Array(gltf.nodes.length);

    /* Find parents for each node */
    gltf.nodes.forEach((n, i) => {
        if(n.children) {
            n.children.forEach(c => parents[c] = i);
        }
    });

    var nodesToRemove = [];
    gltf.nodes.forEach((n, i) => {
        if(nodeIsEmpty(n)) nodesToRemove.push(i);
    });
    nodesToRemove.sort((a, b) => b - a).forEach(n => {
        delete gltf.nodes[n];

        /* Remove this node from parent */
        var parent = parents[n];
        if(parent) {
            gltf.nodes[parent].children =
                gltf.nodes[parent].children.filter(x => x != n);
        }

        /* Shift all node references */
        gltf.nodes.forEach(other => {
            if(other.children) {
                other.children = other.children.map(x => x > n ? x - 1 : x);
            }
        });
        gltf.scenes.forEach(s => {
            s.nodes = s.nodes
                .filter(x => x != n)
                .map(x => x > n ? x - 1 : x);
        });
    });
    gltf.nodes = gltf.nodes.filter(x => !!x);

    return gltf;
}

/** Get world transform of given node
 * @param{Object} gltf Scene
 * @param{number} nodeId Node id to get the world transform of
 */
function getWorldTransform(gltf, nodeId) {
    var node = gltf.nodes[nodeId];
    var mat = node.matrix || mat4.create();
    if(node.translation) mat4.translate(mat, mat, node.translation);
    if(node.rotation) {
        var quatMat = mat4.create();
        mat4.fromQuat(quatMat, node.rotation);
        mat4.multiply(mat, mat, quatMat);
    }
    if(node.scale) mat4.scale(mat, mat, node.scale);

    var parent = findParentNode(gltf, nodeId);
    if(parent) {
        mat4.multiply(mat, getWorldTransform(gltf, parent), mat);
    }

    return mat;
}

/**
 * Convert input gltf to an optimized palette mesh.
 *
 * @param {Object} Input gltf.
 * @return {Object} Converted gltf.
 */
function toPaletteMesh(gltf) {
    var buffers = [];

    gltf.nodes.forEach(function(node, i) {
        if(node.mesh != undefined) {
            let mesh = gltf.meshes[node['mesh']];
            let mergedPrimitives = [];
            ForEach.meshPrimitive(mesh, function(primitive, primitiveId) {
                var mat = gltf.materials[primitive.material];
                if(!mat.pbrMetallicRoughness || mat.alphaMode == 'BLEND') {
                    console.log(`${node.name} => Skipping non-opaque`);
                    return;
                }

                var i = addToPalette(gltf
                    .materials[primitive.material]
                    .pbrMetallicRoughness
                    .baseColorFactor);

                var mat = getWorldTransform(gltf, i);

                buffers.push({
                    indices: primitive.indices,
                    normals: primitive.attributes.NORMAL,
                    positions: primitive.attributes.POSITION,
                    matrix: mat,
                    color: i
                });

                mergedPrimitives.push(primitiveId);
            });

            if(mergedPrimitives.length == mesh.primitives.length) {
                /* We can remove the entire node! Cleaned up later in removeUnusedNodes */
                delete node.mesh;
            } else {
                /* Only some of the primitives have been merged, keep the others */
                mergedPrimitives.forEach(i => delete mesh.primitives[i]);
                mesh.primitives = mesh.primitives.filter(x => !!x);
            }

            console.log(`${node.name} => Merging`);
        } else {
            console.log(`${node.name} => No Mesh`);
            console.log(node);
        }
    });

    /* Counting for statistics */
    var totalIndicesCount = 0;
    var totalCount = 0;
    buffers.forEach(function(b) {
        totalIndicesCount += gltf.accessors[b.indices].count;
        totalCount += gltf.accessors[b.positions].count;
    });

    /* Destination for the data */
    byteBuffers = new Array(4);

    /* Indices */
    var indexOffset = 0; // For merging the meshes
    byteBuffers[0] = buffers.map(b => {
        var arr = readAccessorPacked(gltf, gltf.accessors[b.indices])
            .map(i  => i + indexOffset);
        indexOffset += gltf.accessors[b.positions].count;
        return Uint16Array.from(arr);
    });

    /* Positions */
    byteBuffers[1] = buffers.map(b => {
        var accessor = gltf.accessors[b.positions];
        var arr = readAccessorPacked(gltf, accessor);
        var temp = vec3.create();
        for(var i = 0; i < arr.length; i += 3) {
            vec3.transformMat4(temp, arr.slice(i, i+3), b.matrix);
            arr[i+0] = temp[0];
            arr[i+1] = temp[1];
            arr[i+2] = temp[2];
        }
        return Float32Array.from(arr);
    });

    /* Normals */
    byteBuffers[2] = buffers.map(b => {
        var accessor = gltf.accessors[b.normals];
        var arr = readAccessorPacked(gltf, accessor);
        return Float32Array.from(arr);
    });

    /* Generate texture coordinates */
    var paletteWidth = getNextPowerOf2(PALETTE.length);
    byteBuffers[3] = buffers.map(b => {
        var accessor = gltf.accessors[b.positions];
        var arr = [].concat.apply([], new Array(accessor.count).fill([((b.color+0.5)/paletteWidth)*65535, 0]));
        return Uint16Array.from(arr);
    });

    /* Append palette mesh to scene */
    gltf.scenes[gltf.defaultScene || 0].nodes.push(gltf.nodes.length);
    gltf.nodes.push({
        mesh: gltf.meshes.length,
        name: 'static_root'
    });
    gltf.meshes.push({
        name: 'static_mesh',
        primitives: [{
            material: gltf.materials.length,
            indices: gltf.accessors.length,
            attributes: {
                POSITION: gltf.accessors.length + 1,
                NORMAL: gltf.accessors.length + 2,
                TEXCOORD_0: gltf.accessors.length + 3,
            }
        }]
    });

    /* Add palette material and texture */
    if(gltf.samplers == undefined) gltf.samplers = [];
    if(gltf.textures == undefined) gltf.textures = [];
    if(gltf.images == undefined) gltf.images = [];

    gltf.materials.push({
        name: 'palette_material',
        pbrMetallicRoughness: {
            baseColorTexture: {
                index: gltf.textures.length,
            },
            metallicFactor: 0,
            roughnessFactor: 0.5
        }
    });
    gltf.textures.push({source: gltf.images.length, sampler: gltf.samplers.length});
    gltf.samplers.push({minFilter: 9728, magFilter: 9728});

    var paletteData = paletteToImage();
    gltf.images.push({extras: {_pipeline: {source: paletteData}}});

    /* Merge buffers and add to gltf scene */
    var NAMES = ['indices', 'positions', 'normals', 'texcoords'];
    var COMP_TYPES = [5123 /* UNSIGNED_SHORT */, 5126, 5126, 5123 /* UNSIGNED_SHORT */];
    var TYPES = ['SCALAR', 'VEC3', 'VEC3', 'VEC2'];

    byteBuffers.forEach(function(b, i) {
        var buffer = Buffer.concat(b.map(x => new Uint8Array(x.buffer)));

        gltf.accessors.push({
            name: 'palette_accessor_' + NAMES[i],
            componentType: COMP_TYPES[i],
            count: i == 0 ? totalIndicesCount : totalCount,
            normalized: i == 3,
            type: TYPES[i],
            bufferView: gltf.bufferViews.length,
            byteOffset: 0 /* Workaround for findAccessorMinMax expecting this to be set */
        });

        addBuffer(gltf, getBufferPadded(buffer));
        addMinMax(gltf, gltf.accessors.length-1);
    });

    /* Done, cleanup! */
    console.log(`Total indices: ${totalIndicesCount}`);
    console.log(`Total vertices: ${totalCount}`);

    removeUnusedNodes(gltf);
    removeUnusedMeshes(gltf);
    removeUnusedMaterials(gltf);
    removeUnusedElements(gltf);

    return gltf;
}
