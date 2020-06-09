const PNG = require('pngjs').PNG;
const Buffer = require('buffer').Buffer;

const lib = './node_modules/gltf-pipeline/lib/';
const ForEach = require(lib + 'ForEach');
const addBuffer = require(lib + 'addBuffer');
const readAccessorPacked = require(lib + 'readAccessorPacked');
const findAccessorMinMax = require(lib + 'findAccessorMinMax');
const getBufferPadded = require(lib + 'getBufferPadded');
const removeUnusedElements = require(lib + 'removeUnusedElements');
const sharp = require('sharp');
const rp = require('./rectpack2D.js');

const mat4 = require('gl-matrix').mat4;
const vec3 = require('gl-matrix').vec3;

module.exports = textureAtlas;

async function packImages(name, images, options) {
    let rects = [];
    let atlasImages = [];
    for(const buffer of images) {
        const image = sharp(buffer);
        const meta = await image.metadata();
        rects.push(new rp.rect_xywhf(0, 0, meta.width, meta.height));
        atlasImages.push({
            input: await image.raw().toBuffer(),
            raw: {
                width: meta.width,
                height: meta.height,
                channels: meta.channels
            }
        });
    }
    /* 4096x4096 is max texture size for most WebGL platforms */
    let bins = [];
    if(!rp.pack(rects, 4096, bins)) {
        console.error("Insufficient atlas size.");
    }

    let packedRects = [];
    const size = {
        w: getNextPowerOf2(bins[0].size.w),
        h: getNextPowerOf2(bins[0].size.h)};
    const atlasImage = sharp({
        create: {
            width: size.w,
            height: size.h,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0.0 }
        }
    });

    let index = 0;
    for(const rect of bins[0].rects) {
        packedRects.push({
            x: rect.x/size.w, y: rect.y/size.h,
            w: rect.w/size.w, h: rect.h/size.h});

        atlasImages[index].left = rect.x;
        atlasImages[index].top = rect.y;
        ++index;
    }

    const atlasFilename = './' + name + '.webp';
    let img = await atlasImage
        .composite(atlasImages);

    if(options.format == 'jpeg') {
        img = await img.jpeg({quality: 90}).toBuffer();
    } else if(options.format == 'webp') {
        img = await img.webp({quality: 90}).toBuffer();
    }

    return {packedRects: packedRects, image: img};
}

/** Get next power of two larger than given number */
function getNextPowerOf2(val) {
    return Math.pow(2, Math.ceil(Math.log2(val)));
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
    if(node == undefined) {
        console.log(`${nodeId} was not found, using identity transform`);
        return mat4.create();
    }
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
async function textureAtlas(gltf, options) {
    if(options.atlases.length == 0) {
        console.error("No atlases specified");
        return;
    }
    IMAGE_FORMATS = ['webp', 'jpeg'];
    if(!('format' in options)) {
        options.format = 'webp';
        console.log("No format specified, using default:", options.format);
    }
    if(!IMAGE_FORMATS.includes(options.format)) {
        console.error("Unknown image format '" + options.format + "', expected one of:", IMAGE_FORMATS);
        return;
    }
    let atlasIndexByName = {};
    let index = 0;
    let atlases = [];
    for(let a in options.atlases) {
        if(a in atlasIndexByName) {
            console.error("ERROR: duplicate atlas name", a);
            return;
        }
        atlasIndexByName[a] = index;
        atlases.push({name: a, buffers: [], images: []});
        ++index;
    }

    gltf.nodes.forEach(function(node, nodeId) {

        let atlasName = null;
        for(let a in options.atlases) {
            if(options.atlases[a].includes(node.name)) {
                atlasName = a;
            }
        }

        if(!atlasName) return;
        const atlasIndex = atlasIndexByName[atlasName];

        if(node.mesh != undefined) {
            let mesh = gltf.meshes[node['mesh']];
            let mergedPrimitives = [];
            ForEach.meshPrimitive(mesh, function(primitive, primitiveId) {
                var mat = gltf.materials[primitive.material];
                if(!mat.pbrMetallicRoughness) {
                    console.log(`${node.name} => no pbrMetallicRoughness material`);
                    return;
                }

                if(!('baseColorTexture' in mat.pbrMetallicRoughness)) {
                    return;
                }
                const image = gltf.images[gltf.textures[mat.pbrMetallicRoughness.baseColorTexture.index].source].extras._pipeline.source;
                atlases[atlasIndex].images.push(image);

                var transform = getWorldTransform(gltf, nodeId);

                const bufferIndex = atlases[atlasIndex].buffers.length;
                atlases[atlasIndex].buffers.push({
                    indices: primitive.indices,
                    normals: primitive.attributes.NORMAL,
                    positions: primitive.attributes.POSITION,
                    texCoords: primitive.attributes.TEXCOORD_0,
                    matrix: transform,
                    index: bufferIndex
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

            console.log(`${node.name} => ${atlasName}`);
        } else {
            console.log(`${node.name} => No Mesh`);
            console.log(node);
        }
    });

    /* Generate texture coordinates */
    for(let atlas of atlases) {
        /* Counting for statistics */
        var totalIndicesCount = 0;
        var totalCount = 0;
        atlas.buffers.forEach(function(b) {
            totalIndicesCount += gltf.accessors[b.indices].count;
            totalCount += gltf.accessors[b.positions].count;
        });

        Object.assign(atlas, await packImages(atlas.name, atlas.images, options))

        /* Destination for the data */
        atlas.byteBuffers = new Array(4);

        /* Indices */
        var indexOffset = 0; // For merging the meshes
        atlas.byteBuffers[0] = atlas.buffers.map(b => {
            var arr = readAccessorPacked(gltf, gltf.accessors[b.indices])
                .map(i  => i + indexOffset);
            indexOffset += gltf.accessors[b.positions].count;
            return Uint16Array.from(arr);
        });

        /* Positions */
        atlas.byteBuffers[1] = atlas.buffers.map(b => {
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
        atlas.byteBuffers[2] = atlas.buffers.map(b => {
            var accessor = gltf.accessors[b.normals];
            var arr = readAccessorPacked(gltf, accessor);
            return Float32Array.from(arr);
        });

        /* Texture coordinates */
        atlas.byteBuffers[3] = atlas.buffers.map(b => {
            var rect = atlas.packedRects[b.index];
            var accessor = gltf.accessors[b.texCoords];
            var arr = readAccessorPacked(gltf, accessor);
            for(var i = 0; i < arr.length; i += 2) {
                arr[i+0] = arr[i+0]*rect.w + rect.x;
                arr[i+1] = arr[i+1]*rect.h + rect.y;
            }
            return Float32Array.from(arr);
        });

        /* Append batch to scene */
        gltf.scenes[gltf.defaultScene || 0].nodes.push(gltf.nodes.length);
        gltf.nodes.push({
            mesh: gltf.meshes.length,
            name: atlas.name
        });
        gltf.meshes.push({
            name: 'batch-' + atlas.name,
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
            name: 'atlas-' + atlas.name,
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
        gltf.images.push({extras: {_pipeline: {source: atlas.image}}});

        /* Merge buffers and add to gltf scene */
        var NAMES = ['indices', 'positions', 'normals', 'texcoords'];
        var COMP_TYPES = [
            5123 /* UNSIGNED_SHORT */,
            5126,
            5126,
            5126]; //5123 /* UNSIGNED_SHORT */];
        var TYPES = ['SCALAR', 'VEC3', 'VEC3', 'VEC2'];

        atlas.byteBuffers.forEach(function(b, i) {
            var buffer = Buffer.concat(b.map(x => new Uint8Array(x.buffer)));

            gltf.accessors.push({
                name: atlas + '-accessor-' + NAMES[i],
                componentType: COMP_TYPES[i],
                count: i == 0 ? totalIndicesCount : totalCount,
                normalized: false,//i == 3,
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
    }

    removeUnusedNodes(gltf);
    removeUnusedMeshes(gltf);
    removeUnusedMaterials(gltf);
    removeUnusedElements(gltf);

    return gltf;
}
