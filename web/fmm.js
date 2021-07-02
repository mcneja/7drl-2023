"use strict";

window.onload = main;

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
		attribute vec3 aVertexPosition;
		
		uniform mat4 uProjectionMatrix;

		varying highp float vTextureCoord;

		void main() {
			gl_Position = uProjectionMatrix * vec4(aVertexPosition.xy, 0, 1);
			vTextureCoord = aVertexPosition.z;
		}
	`;

	const fsSource = `
		varying highp float vTextureCoord;

		uniform sampler2D uContour;

		void main() {
			gl_FragColor = texture2D(uContour, vec2(vTextureCoord, 0));
		}
	`;

	const program = initShaderProgram(gl, vsSource, fsSource);

	const gridSizeX = 16;
	const gridSizeY = 16;

	const glResources = {
		program: program,
		attribLocations: {
			vertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
		},
		uniformLocations: {
			projectionMatrix: gl.getUniformLocation(program, 'uProjectionMatrix'),
			uContour: gl.getUniformLocation(program, 'uContour'),
		},
		gridSizeX: gridSizeX,
		gridSizeY: gridSizeY,
		vertexBuffer: createVertexBuffer(gl, gridSizeX, gridSizeY),
		contourTexture: createStripeTexture(gl),
		projectionMatrix: createProjectionMatrix(),
	};

	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	gl.enable(gl.BLEND);
	gl.clearColor(0, 0, 0, 1.0);

	gl.bindBuffer(gl.ARRAY_BUFFER, glResources.vertexBuffer);
	gl.vertexAttribPointer(glResources.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(glResources.attribLocations.vertexPosition);

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

function createVertexBuffer(gl, sizeX, sizeY) {
	const vertexInfo = createVertexInfo(sizeX, sizeY);

	const vertexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, vertexInfo, gl.STATIC_DRAW);

	return vertexBuffer;
}

function createVertexInfo(sizeX, sizeY) {
	const v = new Float32Array(3 * 6 * sizeX * sizeY);
	let i = 0;

	function makeVert(x, y) {
		v[i++] = x;
		v[i++] = y;
		v[i++] = Math.sqrt(x*x + y*y);
	}

	for (let x = 0; x < sizeX; ++x) {
		for (let y = 0; y < sizeY; ++y) {
			makeVert(x, y);
			makeVert(x+1, y);
			makeVert(x, y+1);
			makeVert(x, y+1);
			makeVert(x+1, y);
			makeVert(x+1, y+1);
		}
	}

	return v;
}

function drawScreen(gl, glResources) {
	resizeCanvasToDisplaySize(gl.canvas);
	const screenX = gl.canvas.clientWidth;
	const screenY = gl.canvas.clientHeight;
	gl.viewport(0, 0, screenX, screenY);

	glResources.projectionMatrix[0] = 2 / glResources.gridSizeX;
	glResources.projectionMatrix[5] = 2 / glResources.gridSizeY;

	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.uniformMatrix4fv(glResources.uniformLocations.projectionMatrix, false, glResources.projectionMatrix);

	gl.drawArrays(gl.TRIANGLES, 0, glResources.gridSizeX * glResources.gridSizeY * 6);
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
