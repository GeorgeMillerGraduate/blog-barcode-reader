/**
 * BitMatrix
 *
 * Represents a two-dimensional matrix of boolean values.
 * Each position represents a single binary module/pixel:
 *
 * false = 0 / white
 * true  = 1 / black
 *
 * Used throughout the barcode scanner after an image has
 * been converted into a binary representation.
 */
class BitMatrix {

    /**
     * Creates a new BitMatrix.
     *
     * @param {number} width  Matrix width.
     * @param {number} height Matrix height. Defaults to width.
     */
    constructor(width, height = width) {

        if (!Number.isInteger(width) || width <= 0) {
            throw new Error("BitMatrix width must be a positive integer.");
        }

        if (!Number.isInteger(height) || height <= 0) {
            throw new Error("BitMatrix height must be a positive integer.");
        }

        this.width = width;
        this.height = height;

        /*
         * Uint8Array is used instead of a normal JavaScript array.
         *
         * Each entry is:
         * 0 = false
         * 1 = true
         */
        this.bits = new Uint8Array(width * height);
    }


    /**
     * Returns the array index corresponding to an x/y coordinate.
     *
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    getIndex(x, y) {

        this.checkCoordinates(x, y);

        return (y * this.width) + x;
    }


    /**
     * Checks whether a coordinate exists inside the matrix.
     *
     * @param {number} x
     * @param {number} y
     */
    checkCoordinates(x, y) {

        if (!Number.isInteger(x) || !Number.isInteger(y)) {
            throw new Error(
                "BitMatrix coordinates must be integers."
            );
        }

        if (
            x < 0 ||
            y < 0 ||
            x >= this.width ||
            y >= this.height
        ) {
            throw new RangeError(
                `BitMatrix coordinate out of bounds: (${x}, ${y})`
            );
        }
    }


    /**
     * Returns the value stored at x/y.
     *
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    get(x, y) {

        const index = this.getIndex(x, y);

        return this.bits[index] === 1;
    }


    /**
     * Sets a matrix position.
     *
     * @param {number} x
     * @param {number} y
     * @param {boolean} value
     */
    set(x, y, value = true) {

        const index = this.getIndex(x, y);

        this.bits[index] = value ? 1 : 0;
    }


    /**
     * Sets a position to false.
     *
     * @param {number} x
     * @param {number} y
     */
    unset(x, y) {

        this.set(x, y, false);
    }


    /**
     * Flips a matrix position.
     *
     * true  -> false
     * false -> true
     *
     * @param {number} x
     * @param {number} y
     */
    flip(x, y) {

        const index = this.getIndex(x, y);

        this.bits[index] ^= 1;
    }


    /**
     * Clears the entire matrix.
     */
    clear() {

        this.bits.fill(0);
    }


    /**
     * Fills the entire matrix.
     */
    fill() {

        this.bits.fill(1);
    }


    /**
     * Returns true if the coordinate lies inside the matrix.
     *
     * Unlike get() and set(), this method does not throw an error.
     *
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    isInside(x, y) {

        return (
            Number.isInteger(x) &&
            Number.isInteger(y) &&
            x >= 0 &&
            y >= 0 &&
            x < this.width &&
            y < this.height
        );
    }


    /**
     * Sets a rectangular region of the matrix to true.
     *
     * @param {number} left
     * @param {number} top
     * @param {number} width
     * @param {number} height
     */
    setRegion(left, top, width, height) {

        if (
            !Number.isInteger(left) ||
            !Number.isInteger(top) ||
            !Number.isInteger(width) ||
            !Number.isInteger(height)
        ) {
            throw new Error(
                "BitMatrix region values must be integers."
            );
        }

        if (width <= 0 || height <= 0) {
            throw new Error(
                "BitMatrix region dimensions must be positive."
            );
        }

        const right = left + width;
        const bottom = top + height;

        if (
            left < 0 ||
            top < 0 ||
            right > this.width ||
            bottom > this.height
        ) {
            throw new RangeError(
                "BitMatrix region extends outside the matrix."
            );
        }

        for (let y = top; y < bottom; y++) {

            const rowOffset = y * this.width;

            for (let x = left; x < right; x++) {
                this.bits[rowOffset + x] = 1;
            }
        }
    }


    /**
     * Returns a copy of one matrix row.
     *
     * @param {number} y
     * @returns {Uint8Array}
     */
    getRow(y) {

        if (
            !Number.isInteger(y) ||
            y < 0 ||
            y >= this.height
        ) {
            throw new RangeError(
                `BitMatrix row out of bounds: ${y}`
            );
        }

        const start = y * this.width;
        const end = start + this.width;

        return this.bits.slice(start, end);
    }


    /**
     * Replaces an entire matrix row.
     *
     * @param {number} y
     * @param {Array|Uint8Array} row
     */
    setRow(y, row) {

        if (
            !Number.isInteger(y) ||
            y < 0 ||
            y >= this.height
        ) {
            throw new RangeError(
                `BitMatrix row out of bounds: ${y}`
            );
        }

        if (!row || row.length !== this.width) {
            throw new Error(
                "BitMatrix row length must equal matrix width."
            );
        }

        const start = y * this.width;

        for (let x = 0; x < this.width; x++) {
            this.bits[start + x] = row[x] ? 1 : 0;
        }
    }


    /**
     * Returns the number of true/black cells.
     *
     * @returns {number}
     */
    countSetBits() {

        let count = 0;

        for (let i = 0; i < this.bits.length; i++) {
            count += this.bits[i];
        }

        return count;
    }


    /**
     * Returns a deep copy of this BitMatrix.
     *
     * @returns {BitMatrix}
     */
    clone() {

        const copy = new BitMatrix(
            this.width,
            this.height
        );

        copy.bits.set(this.bits);

        return copy;
    }


    /**
     * Converts the matrix into a standard 2D boolean array.
     *
     * Useful for debugging and passing the matrix to code that
     * expects matrix[y][x].
     *
     * @returns {boolean[][]}
     */
    toArray() {

        const matrix = [];

        for (let y = 0; y < this.height; y++) {

            const row = [];

            for (let x = 0; x < this.width; x++) {
                row.push(
                    this.bits[(y * this.width) + x] === 1
                );
            }

            matrix.push(row);
        }

        return matrix;
    }


    /**
     * Creates a BitMatrix from a two-dimensional array.
     *
     * @param {Array<Array<boolean|number>>} matrix
     * @returns {BitMatrix}
     */
    static fromArray(matrix) {

        if (
            !Array.isArray(matrix) ||
            matrix.length === 0 ||
            !Array.isArray(matrix[0]) ||
            matrix[0].length === 0
        ) {
            throw new Error(
                "BitMatrix.fromArray requires a non-empty 2D array."
            );
        }

        const height = matrix.length;
        const width = matrix[0].length;

        const result = new BitMatrix(width, height);

        for (let y = 0; y < height; y++) {

            if (
                !Array.isArray(matrix[y]) ||
                matrix[y].length !== width
            ) {
                throw new Error(
                    "All BitMatrix rows must have the same width."
                );
            }

            for (let x = 0; x < width; x++) {

                if (matrix[y][x]) {
                    result.bits[(y * width) + x] = 1;
                }
            }
        }

        return result;
    }


    /**
     * Creates a human-readable representation of the matrix.
     *
     * Useful while debugging QR detection.
     *
     * @param {string} setCharacter
     * @param {string} unsetCharacter
     * @returns {string}
     */
    toString(
        setCharacter = "██",
        unsetCharacter = "  "
    ) {

        let output = "";

        for (let y = 0; y < this.height; y++) {

            for (let x = 0; x < this.width; x++) {

                output += this.bits[
                    (y * this.width) + x
                ]
                    ? setCharacter
                    : unsetCharacter;
            }

            output += "\n";
        }

        return output;
    }
}