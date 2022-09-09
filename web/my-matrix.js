export { vec2, mat4 };
var vec2;
(function (vec2) {
    function create() {
        return [0, 0];
    }
    vec2.create = create;
    function clone(v) {
        return [v[0], v[1]];
    }
    vec2.clone = clone;
    function fromValues(x0, x1) {
        return [x0, x1];
    }
    vec2.fromValues = fromValues;
    function copy(result, v) {
        result[0] = v[0];
        result[1] = v[1];
    }
    vec2.copy = copy;
    function set(result, x0, x1) {
        result[0] = x0;
        result[1] = x1;
    }
    vec2.set = set;
    function add(result, a, b) {
        result[0] = a[0] + b[0];
        result[1] = a[1] + b[1];
    }
    vec2.add = add;
    function subtract(result, a, b) {
        result[0] = a[0] - b[0];
        result[1] = a[1] - b[1];
    }
    vec2.subtract = subtract;
    function multiply(result, a, b) {
        result[0] = a[0] * b[0];
        result[1] = a[1] * b[1];
    }
    vec2.multiply = multiply;
    function scale(result, a, scale) {
        result[0] = a[0] * scale;
        result[1] = a[1] * scale;
    }
    vec2.scale = scale;
    function scaleAndAdd(result, a, b, scale) {
        result[0] = a[0] + b[0] * scale;
        result[1] = a[1] + b[1] * scale;
    }
    vec2.scaleAndAdd = scaleAndAdd;
    function distance(a, b) {
        const x = a[0] - b[0];
        const y = a[1] - b[1];
        return Math.hypot(x, y);
    }
    vec2.distance = distance;
    function squaredDistance(a, b) {
        const x = a[0] - b[0];
        const y = a[1] - b[1];
        return x * x + y * y;
    }
    vec2.squaredDistance = squaredDistance;
    function length(a) {
        return Math.hypot(a[0], a[1]);
    }
    vec2.length = length;
    function squaredLength(a) {
        const x = a[0];
        const y = a[1];
        return x * x + y * y;
    }
    vec2.squaredLength = squaredLength;
    function negate(result, a) {
        result[0] = -a[0];
        result[1] = -a[1];
    }
    vec2.negate = negate;
    function dot(a, b) {
        return a[0] * b[0] + a[1] * b[1];
    }
    vec2.dot = dot;
    function lerp(result, a, b, t) {
        result[0] = a[0] + t * (b[0] - a[0]);
        result[1] = a[1] + t * (b[1] - a[1]);
    }
    vec2.lerp = lerp;
    function zero(result) {
        result[0] = 0;
        result[1] = 0;
    }
    vec2.zero = zero;
})(vec2 || (vec2 = {}));
var mat4;
(function (mat4) {
    function create() {
        return [
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
        ];
    }
    mat4.create = create;
    function copy(result, a) {
        result[0] = a[0];
        result[1] = a[1];
        result[2] = a[2];
        result[3] = a[3];
        result[4] = a[4];
        result[5] = a[5];
        result[6] = a[6];
        result[7] = a[7];
        result[8] = a[8];
        result[9] = a[9];
        result[10] = a[10];
        result[11] = a[11];
        result[12] = a[12];
        result[13] = a[13];
        result[14] = a[14];
        result[15] = a[15];
    }
    mat4.copy = copy;
    function ortho(result, left, right, bottom, top, near, far) {
        const lr = 1 / (left - right);
        const bt = 1 / (bottom - top);
        const nf = 1 / (near - far);
        result[0] = -2 * lr;
        result[1] = 0;
        result[2] = 0;
        result[3] = 0;
        result[4] = 0;
        result[5] = -2 * bt;
        result[6] = 0;
        result[7] = 0;
        result[8] = 0;
        result[9] = 0;
        result[10] = 2 * nf;
        result[11] = 0;
        result[12] = (left + right) * lr;
        result[13] = (top + bottom) * bt;
        result[14] = (far + near) * nf;
        result[15] = 1;
    }
    mat4.ortho = ortho;
})(mat4 || (mat4 = {}));
