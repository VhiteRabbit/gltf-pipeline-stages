# Vhite Rabbit's Custom glTF Pipeline Stages

<p align="center">
<a href="https://www.khronos.org/gltf"><img src="doc/gltf.png" onerror="this.src='gltf.png'"/></a>
</p>

Custom pipeline stages for [glTF pipeline](https://github.com/AnalyticalGraphicsInc),
content pipeline tools for optimizing [glTF](https://www.khronos.org/gltf/) assets.

## Getting Started

Install [Node.js](https://nodejs.org/en/), then run
```
npm install
```

in the root of this repository to install its dependencies.

Then import the stage you want to use and add it to the `customStages`
option for `processGlb`, `processGltf` or `glbToGltf`:

```
const fsExtra = require('fs-extra');
const processGltf = require('gltf-pipeline').processGltf;

/* Import our custom pipeline stage */
const myStage = require('myStage');

fsExtra.readJson('input.gltf')
    .then(gltf => {
        return processGltf(gltf, {customStages: myStage});
    })
    .then(result => {
        fsExtra.writeJsonSync('output.gltf', result.gltf)
    })
    .catch(console.error);
```

## Stages

| Stage    | Description | Optimizes |
|----------|-------------|-----------|
| toPaletteMesh | Palette mesh optimization for static scenes with colored meshes. Joins all meshes with opaque materials and generates a palette texture that contains all colors together with texture coordinates indexing into this texture. (See [this blog post](https://blog.constructarca.de/palette-mesh-optimization) for more information)| Draw calls |

## License

Vhite Rabbit's custom pipeline stages are released under MIT license:

```
Copyright © 2019 Vhite Rabbit <contact@vhiterabbit.com>
Copyright © 2019 Jonathan Hale <squareys@googlemail.com>

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
```
