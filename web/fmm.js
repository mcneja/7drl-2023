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
		attribute vec3 vPosition;
		attribute vec2 vDistance;
		attribute vec2 vSpeed;
		
		uniform mat4 uProjectionMatrix;

		varying highp float fYBlend;
		varying highp vec2 fDistance;
		varying highp vec2 fSpeed;

		void main() {
			gl_Position = uProjectionMatrix * vec4(vPosition.xy, 0, 1);
			fYBlend = vPosition.z;
			fDistance = vDistance;
			fSpeed = vSpeed;
		}
	`;

	const fsSource = `
		varying highp float fYBlend;
		varying highp vec2 fDistance;
		varying highp vec2 fSpeed;

		uniform sampler2D uContour;

		void main() {
			highp float distance = mix(fDistance.x, fDistance.y, fYBlend);
			highp float speed = mix(fSpeed.x, fSpeed.y, fYBlend);
			highp float b = 0.5 * speed + 0.5;
			gl_FragColor = texture2D(uContour, vec2(distance, 0)) * vec4(1, b, b, 1);
		}
	`;

	const program = initShaderProgram(gl, vsSource, fsSource);

	const gridSizeX = 16;
	const gridSizeY = 16;

	const glResources = {
		program: program,
		attribLocations: {
			vertexPosition: gl.getAttribLocation(program, 'vPosition'),
			vertexDistance: gl.getAttribLocation(program, 'vDistance'),
			vertexSpeed: gl.getAttribLocation(program, 'vSpeed'),
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

//	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
//	gl.enable(gl.BLEND);
	gl.clearColor(0, 0, 0, 1.0);

	gl.bindBuffer(gl.ARRAY_BUFFER, glResources.vertexBuffer);
	const stride = 28; // seven 4-byte floats
	gl.vertexAttribPointer(glResources.attribLocations.vertexPosition, 3, gl.FLOAT, false, stride, 0);
	gl.vertexAttribPointer(glResources.attribLocations.vertexDistance, 2, gl.FLOAT, false, stride, 12);
	gl.vertexAttribPointer(glResources.attribLocations.vertexSpeed, 2, gl.FLOAT, false, stride, 20);
	gl.enableVertexAttribArray(glResources.attribLocations.vertexPosition);
	gl.enableVertexAttribArray(glResources.attribLocations.vertexDistance);
	gl.enableVertexAttribArray(glResources.attribLocations.vertexSpeed);

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
	const v = new Float32Array(7 * 6 * sizeX * sizeY);
	let i = 0;

	function distance(x, y) {
		return Math.sqrt(x*x + y*y);
	}

	function speed(x, y) {
		let z = ((x & 7) == 0 || (y & 7) == 0) ? 0 : 1;
		return z;
	}

	function makeVert(x, y, s, d0, d1, c0, c1) {
		v[i++] = x;
		v[i++] = y;
		v[i++] = s;
		v[i++] = d0;
		v[i++] = d1;
		v[i++] = c0;
		v[i++] = c1;
	}

	for (let x = 0; x < sizeX; ++x) {
		for (let y = 0; y < sizeY; ++y) {
			const dist00 = distance(x, y);
			const dist10 = distance(x+1, y);
			const dist01 = distance(x, y+1);
			const dist11 = distance(x+1, y+1);
			const speed00 = speed(x, y);
			const speed10 = speed(x+1, y);
			const speed01 = speed(x, y+1);
			const speed11 = speed(x+1, y+1);
			makeVert(x, y, 0, dist00, dist01, speed00, speed01);
			makeVert(x+1, y, 0, dist10, dist11, speed10, speed11);
			makeVert(x, y+1, 1, dist00, dist01, speed00, speed01);
			makeVert(x, y+1, 1, dist00, dist01, speed00, speed01);
			makeVert(x+1, y, 0, dist10, dist11, speed10, speed11);
			makeVert(x+1, y+1, 1, dist10, dist11, speed10, speed11);
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
	gl.uniformMatrix4fv(glResources.uniformLocations.projectionMatrix, false, glResources.projectionMatrix);

	gl.clear(gl.COLOR_BUFFER_BIT);
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
