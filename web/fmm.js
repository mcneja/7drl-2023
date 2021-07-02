"use strict";

window.onload = main;

const maxQuads = 4096;

// Functions

function main() {

	const canvas = document.querySelector("#canvas");
	const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false });

	if (gl == null) {
		alert("Unable to initialize WebGL. Your browser or machine may not support it.");
		return;
	}

	const glResources = initGlResources(gl);

	requestAnimationFrame(now => drawScreen(gl, glResources));
}

function initGlResources(gl) {
	const vsSource = `
		attribute vec4 aVertexPosition;
		
		uniform mat4 uProjectionMatrix;

		varying highp vec2 vTextureCoord;

		void main() {
			gl_Position = uProjectionMatrix * vec4(aVertexPosition.xy, 0, 1);
			vTextureCoord = aVertexPosition.zw;
		}
	`;

	const fsSource = `
		varying highp vec2 vTextureCoord;

		uniform sampler2D uContour;

		void main() {
			gl_FragColor = texture2D(uContour, vTextureCoord);
		}
	`;

	const program = initShaderProgram(gl, vsSource, fsSource);

	const glResources = {
		program: program,
		attribLocations: {
			vertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
		},
		uniformLocations: {
			projectionMatrix: gl.getUniformLocation(program, 'uProjectionMatrix'),
			uContour: gl.getUniformLocation(program, 'uContour'),
		},
		vertexPositions: new Float32Array(maxQuads * 16),
		numQuads: 0,
		vertexPositionsBuffer: gl.createBuffer(),
		vertexIndices: createElementBuffer(gl),
		contourTexture: createStripeTexture(gl),
		projectionMatrix: createProjectionMatrix(),
	};

	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	gl.enable(gl.BLEND);
	gl.clearColor(0, 0, 0, 1.0);

	gl.bindBuffer(gl.ARRAY_BUFFER, glResources.vertexPositionsBuffer);
	gl.vertexAttribPointer(glResources.attribLocations.vertexPosition, 4, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(glResources.attribLocations.vertexPosition);

	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glResources.vertexIndices);

	gl.useProgram(glResources.program);

	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, glResources.contourTexture);
	gl.uniform1i(glResources.uniformLocations.uContour, 0);

	return glResources;
}

function createProjectionMatrix() {
	const projectionMatrix = new Float32Array(16);

	projectionMatrix.fill(0);
	projectionMatrix[10] = 1;
	projectionMatrix[12] = -1;
	projectionMatrix[13] = -1;
	projectionMatrix[15] = 1;

	return projectionMatrix;
}

function createElementBuffer(gl) {

	const indices = new Uint16Array(maxQuads * 6);

	for (let i = 0; i < maxQuads; ++i) {
		let j = 6*i;
		let k = 4*i;
		indices[j+0] = k+0;
		indices[j+1] = k+1;
		indices[j+2] = k+2;
		indices[j+3] = k+2;
		indices[j+4] = k+1;
		indices[j+5] = k+3;
	}

	const indexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
	
	return indexBuffer;
}

function drawScreen(gl, glResources) {
	resizeCanvasToDisplaySize(gl.canvas);
	const screenX = gl.canvas.clientWidth;
	const screenY = gl.canvas.clientHeight;
	gl.viewport(0, 0, screenX, screenY);

	glResources.projectionMatrix[0] = 2 / screenX;
	glResources.projectionMatrix[5] = 2 / screenY;

	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.uniformMatrix4fv(glResources.uniformLocations.projectionMatrix, false, glResources.projectionMatrix);

	addQuad(gl, glResources, 0, 0, screenX, screenY, 0, 16, 16, 32);
	renderQuads(gl, glResources);
}

function resizeCanvasToDisplaySize(canvas) {
	const displayWidth  = canvas.clientWidth;
	const displayHeight = canvas.clientHeight;
	if (canvas.width  !== displayWidth || canvas.height !== displayHeight) {
		canvas.width  = displayWidth;
		canvas.height = displayHeight;
	}
}

function initShaderProgram(gl, vsSource, fsSource) {
	const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
	const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

	const program = gl.createProgram();
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(program));
		return null;
	}

	return program;
}

function loadShader(gl, type, source) {
	const shader = gl.createShader(type);

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}

	return shader;
}

function renderQuads(gl, glResources) {
	if (glResources.numQuads > 0) {
		gl.bindBuffer(gl.ARRAY_BUFFER, glResources.vertexPositionsBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, glResources.vertexPositions, gl.DYNAMIC_DRAW);

		gl.drawElements(gl.TRIANGLES, 6 * glResources.numQuads, gl.UNSIGNED_SHORT, 0);
	}
	glResources.numQuads = 0;
}

function addQuad(gl, glResources, x0, y0, x1, y1, s00, s10, s01, s11) {
	if (glResources.numQuads >= maxQuads) {
		// Buffer is full; render
		renderQuads(gl, glResources);
	}

	// Append four vertices to the position/texcoord array

	const i = glResources.numQuads * 16;

	glResources.vertexPositions[i+0] = x0;
	glResources.vertexPositions[i+1] = y0;
	glResources.vertexPositions[i+2] = s00;
	glResources.vertexPositions[i+3] = 0;

	glResources.vertexPositions[i+4] = x1;
	glResources.vertexPositions[i+5] = y0;
	glResources.vertexPositions[i+6] = s10;
	glResources.vertexPositions[i+7] = 0;

	glResources.vertexPositions[i+8] = x0;
	glResources.vertexPositions[i+9] = y1;
	glResources.vertexPositions[i+10] = s01;
	glResources.vertexPositions[i+11] = 0;

	glResources.vertexPositions[i+12] = x1;
	glResources.vertexPositions[i+13] = y1;
	glResources.vertexPositions[i+14] = s11;
	glResources.vertexPositions[i+15] = 0;

	++glResources.numQuads;
}

function createStripeTexture(gl) {
	const stripeImageWidth = 64;
	const stripeImage = new Uint8Array(stripeImageWidth);
	for (let j = 0; j < stripeImageWidth; ++j) {
		stripeImage[j] = (j < 128) ? (224 + j/4) : 255;
	}

	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

	const level = 0;
	const internalFormat = gl.LUMINANCE;
	const srcFormat = gl.LUMINANCE;
	const srcType = gl.UNSIGNED_BYTE;
	gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, stripeImageWidth, 1, 0, srcFormat, srcType, stripeImage);
	gl.generateMipmap(gl.TEXTURE_2D);

	return texture;
}

function createDistanceTexture(gl) {
	const textureSizeX = 64;
	const textureSizeY = 64;
	const textureImage = new Float32Array(textureSizeX * textureSizeY);
	for (let x = 0; x < textureSizeX; ++x) {
		for (let y = 0; y < textureSizeY; ++y) {
			textureImage[y * textureSizeX + x] = Math.sqrt(x^2 + y^2);
		}
	}

	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

	const level = 0;
	const internalFormat = gl.LUMINANCE;
	const srcFormat = gl.LUMINANCE;
	const srcType = gl.FLOAT;
	gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, textureSizeX, textureSizeY, 0, srcFormat, srcType, textureImage);

	return texture;
}

function generateMap() {
	const gridSizeX = 32;
	const gridSizeY = 32;

	const gridImage = new Float32Array(gridSizeX * gridSizeY);

	for (let x = 0; x < gridSizeX; ++x) {
		for (let y = 0; y < gridSizeY; ++y) {
			gridImage[y * gridSizeX + x] = Math.random();
		}
	}

	return {
		sizeX: gridSizeX,
		sizeY: gridSizeY,
		data: gridImage,
	}
}
