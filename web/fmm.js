"use strict";

window.onload = main;

// Buffer for accumulating geometry to be sent for rendering
// Position: four vertices per quad, four components per position (x, y, s, t)

const maxQuads = 4096;
const vertexPositions = new Float32Array(maxQuads * 16);
let numQuads = 0;

// Projection matrix memory

const projectionMatrix = new Float32Array(16);

// Functions

function main() {

	// The projection matrix mostly stays as zeroes

	projectionMatrix.fill(0);
	projectionMatrix[10] = 1;
	projectionMatrix[12] = -1;
	projectionMatrix[13] = -1;
	projectionMatrix[15] = 1;

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

		uniform sampler2D uSampler;

		void main() {
			gl_FragColor = texture2D(uSampler, vTextureCoord);
		}
	`;

	const program = initShaderProgram(gl, vsSource, fsSource);

	const buffers = initBuffers(gl);

	const glResources = {
		program: program,
		attribLocations: {
			vertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
		},
		uniformLocations: {
			projectionMatrix: gl.getUniformLocation(program, 'uProjectionMatrix'),
			uSampler: gl.getUniformLocation(program, 'uSampler'),
		},
		buffers: buffers,
		contourTexture: makeStripeTexture(gl),
	};

	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	gl.enable(gl.BLEND);
	gl.clearColor(0, 0, 0, 1.0);

	gl.bindBuffer(gl.ARRAY_BUFFER, glResources.buffers.position);
	gl.vertexAttribPointer(glResources.attribLocations.vertexPosition, 4, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(glResources.attribLocations.vertexPosition);

	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glResources.buffers.indices);

	gl.useProgram(glResources.program);

	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, glResources.contourTexture);
	gl.uniform1i(glResources.uniformLocations.uSampler, 0);

	return glResources;
}

function initBuffers(gl) {
	return {
		position: gl.createBuffer(),
		indices: createElementBuffer(gl),
	};
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

	projectionMatrix[0] = 2 / screenX;
	projectionMatrix[5] = 2 / screenY;

	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.uniformMatrix4fv(glResources.uniformLocations.projectionMatrix, false, projectionMatrix);

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
	if (numQuads > 0) {
		gl.bindBuffer(gl.ARRAY_BUFFER, glResources.buffers.position);
		gl.bufferData(gl.ARRAY_BUFFER, vertexPositions, gl.DYNAMIC_DRAW);

		gl.drawElements(gl.TRIANGLES, 6 * numQuads, gl.UNSIGNED_SHORT, 0);
	}
	numQuads = 0;
}

function addQuad(gl, glResources, x0, y0, x1, y1, s00, s10, s01, s11) {
	if (numQuads >= maxQuads) {
		// Buffer is full; render
		renderQuads(gl, glResources);
	}

	// Append four vertices to the position/texcoord array

	const i = numQuads * 16;

	vertexPositions[i+0] = x0;
	vertexPositions[i+1] = y0;
	vertexPositions[i+2] = s00;
	vertexPositions[i+3] = 0;

	vertexPositions[i+4] = x1;
	vertexPositions[i+5] = y0;
	vertexPositions[i+6] = s10;
	vertexPositions[i+7] = 0;

	vertexPositions[i+8] = x0;
	vertexPositions[i+9] = y1;
	vertexPositions[i+10] = s01;
	vertexPositions[i+11] = 0;

	vertexPositions[i+12] = x1;
	vertexPositions[i+13] = y1;
	vertexPositions[i+14] = s11;
	vertexPositions[i+15] = 0;

	++numQuads;
}

function makeStripeTexture(gl) {
	const stripe_image_width = 64;
	const stripe_image = new Uint8Array(stripe_image_width);
	for (let j = 0; j < stripe_image_width; ++j) {
		stripe_image[j] = (j < 128) ? (224 + j/4) : 255;
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
	gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, stripe_image_width, 1, 0, srcFormat, srcType, stripe_image);
	gl.generateMipmap(gl.TEXTURE_2D);

	return texture;
}
