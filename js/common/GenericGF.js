/**
 * GenericGF
 *
 * Implements arithmetic over a binary Galois Field GF(2^m).
 *
 * Reed-Solomon error correction used by barcode formats such
 * as QR Code operates over finite fields rather than ordinary
 * integer arithmetic.
 *
 * Addition/subtraction is XOR.
 * Multiplication and division use logarithm/exponent tables.
 */
class GenericGF {

    /**
     * Creates a Galois Field.
     *
     * @param {number} primitive
     *        Primitive polynomial defining the field.
     *
     * @param {number} size
     *        Number of elements in the field.
     *
     * @param {number} generatorBase
     *        Generator base used by Reed-Solomon.
     */
    constructor(primitive, size, generatorBase) {

        if (
            !Number.isInteger(primitive) ||
            primitive <= 0
        ) {
            throw new Error(
                "GenericGF primitive must be a positive integer."
            );
        }

        if (
            !Number.isInteger(size) ||
            size <= 1
        ) {
            throw new Error(
                "GenericGF size must be greater than 1."
            );
        }

        if (
            !Number.isInteger(generatorBase) ||
            generatorBase < 0
        ) {
            throw new Error(
                "GenericGF generatorBase must be a non-negative integer."
            );
        }


        this.primitive = primitive;
        this.size = size;
        this.generatorBase = generatorBase;


        /*
         * Exponent table:
         *
         * expTable[i] = α^i
         */
        this.expTable =
            new Int32Array(size);


        /*
         * Logarithm table:
         *
         * logTable[value] = exponent
         *
         * log(0) is undefined and therefore left unused.
         */
        this.logTable =
            new Int32Array(size);


        /*
         * Build the field tables.
         */
        let x = 1;

        for (let i = 0; i < size; i++) {

            this.expTable[i] = x;

            x <<= 1;

            /*
             * If x has overflowed beyond the field,
             * reduce it using the primitive polynomial.
             */
            if (x >= size) {

                x ^= primitive;

                x &= size - 1;
            }
        }


        /*
         * Build the inverse mapping from field value
         * to exponent.
         *
         * expTable[0] is 1, so iteration starts at 0.
         */
        for (let i = 0; i < size - 1; i++) {

            this.logTable[
                this.expTable[i]
            ] = i;
        }


        /*
         * Polynomial constants are created lazily.
         *
         * GenericGFPoly.js must be loaded before these
         * getters are actually used.
         */
        this.zero = null;
        this.one = null;
    }


    /**
     * Returns the additive identity polynomial.
     *
     * @returns {GenericGFPoly}
     */
    getZero() {

        if (this.zero === null) {

            if (typeof GenericGFPoly === "undefined") {
                throw new Error(
                    "GenericGFPoly must be loaded before using getZero()."
                );
            }

            this.zero =
                new GenericGFPoly(
                    this,
                    [0]
                );
        }

        return this.zero;
    }


    /**
     * Returns the multiplicative identity polynomial.
     *
     * @returns {GenericGFPoly}
     */
    getOne() {

        if (this.one === null) {

            if (typeof GenericGFPoly === "undefined") {
                throw new Error(
                    "GenericGFPoly must be loaded before using getOne()."
                );
            }

            this.one =
                new GenericGFPoly(
                    this,
                    [1]
                );
        }

        return this.one;
    }


    /**
     * Addition and subtraction are identical in GF(2^m).
     *
     * Both operations are simply XOR.
     *
     * @param {number} a
     * @param {number} b
     * @returns {number}
     */
    addOrSubtract(a, b) {

        return a ^ b;
    }


    /**
     * Returns α^a.
     *
     * @param {number} a
     * @returns {number}
     */
    exp(a) {

        if (!Number.isInteger(a)) {
            throw new Error(
                "GenericGF.exp requires an integer."
            );
        }

        /*
         * Exponents repeat every size - 1 elements.
         */
        const period =
            this.size - 1;

        a %= period;

        if (a < 0) {
            a += period;
        }

        return this.expTable[a];
    }


    /**
     * Returns log base α of a field element.
     *
     * log(0) is undefined.
     *
     * @param {number} a
     * @returns {number}
     */
    log(a) {

        this.checkElement(a);

        if (a === 0) {
            throw new Error(
                "GenericGF.log(0) is undefined."
            );
        }

        return this.logTable[a];
    }


    /**
     * Multiplies two field elements.
     *
     * a × b =
     *
     * α ^ (
     *     log(a) + log(b)
     * )
     *
     * @param {number} a
     * @param {number} b
     * @returns {number}
     */
    multiply(a, b) {

        this.checkElement(a);
        this.checkElement(b);

        if (a === 0 || b === 0) {
            return 0;
        }

        const logSum =
            this.logTable[a] +
            this.logTable[b];

        return this.expTable[
            logSum % (this.size - 1)
        ];
    }


    /**
     * Divides one field element by another.
     *
     * @param {number} a
     * @param {number} b
     * @returns {number}
     */
    divide(a, b) {

        this.checkElement(a);
        this.checkElement(b);

        if (b === 0) {
            throw new Error(
                "Cannot divide by zero in GenericGF."
            );
        }

        if (a === 0) {
            return 0;
        }

        let logDifference =
            this.logTable[a] -
            this.logTable[b];

        const period =
            this.size - 1;

        if (logDifference < 0) {
            logDifference += period;
        }

        return this.expTable[
            logDifference
        ];
    }


    /**
     * Returns the multiplicative inverse of a.
     *
     * For non-zero a:
     *
     * a^-1 = α^(size - 1 - log(a))
     *
     * @param {number} a
     * @returns {number}
     */
    inverse(a) {

        this.checkElement(a);

        if (a === 0) {
            throw new Error(
                "Cannot calculate the inverse of zero."
            );
        }

        return this.expTable[
            (this.size - 1) -
            this.logTable[a]
        ];
    }


    /**
     * Creates the monomial:
     *
     * coefficient × x^degree
     *
     * @param {number} degree
     * @param {number} coefficient
     * @returns {GenericGFPoly}
     */
    buildMonomial(degree, coefficient) {

        if (
            !Number.isInteger(degree) ||
            degree < 0
        ) {
            throw new Error(
                "Monomial degree must be a non-negative integer."
            );
        }

        this.checkElement(coefficient);


        if (typeof GenericGFPoly === "undefined") {
            throw new Error(
                "GenericGFPoly must be loaded before building polynomials."
            );
        }


        if (coefficient === 0) {
            return this.getZero();
        }


        /*
         * GenericGFPoly stores coefficients from the
         * highest degree to the constant term.
         *
         * coefficient × x^degree therefore becomes:
         *
         * [coefficient, 0, 0, ...]
         */
        const coefficients =
            new Int32Array(degree + 1);

        coefficients[0] =
            coefficient;

        return new GenericGFPoly(
            this,
            coefficients
        );
    }


    /**
     * Checks whether a value is a valid element
     * of this field.
     *
     * @param {number} value
     */
    checkElement(value) {

        if (
            !Number.isInteger(value) ||
            value < 0 ||
            value >= this.size
        ) {
            throw new RangeError(
                `Value ${value} is outside GF(0-${this.size - 1}).`
            );
        }
    }


    /**
     * Returns the field size.
     *
     * @returns {number}
     */
    getSize() {

        return this.size;
    }


    /**
     * Returns the primitive polynomial.
     *
     * @returns {number}
     */
    getPrimitive() {

        return this.primitive;
    }


    /**
     * Returns the Reed-Solomon generator base.
     *
     * @returns {number}
     */
    getGeneratorBase() {

        return this.generatorBase;
    }


    /**
     * Returns a description useful while debugging.
     *
     * @returns {string}
     */
    toString() {

        return (
            `GF(size=${this.size}, ` +
            `primitive=0x${this.primitive.toString(16)}, ` +
            `generatorBase=${this.generatorBase})`
        );
    }


    /* =====================================================
       COMMON BARCODE FIELDS
       ===================================================== */


    /**
     * QR Code Reed-Solomon field.
     *
     * GF(256)
     * Primitive polynomial: x^8 + x^4 + x^3 + x^2 + 1
     * Hex: 0x011D
     */
    static get QR_CODE_FIELD_256() {

        if (!GenericGF._QR_CODE_FIELD_256) {

            GenericGF._QR_CODE_FIELD_256 =
                new GenericGF(
                    0x011D,
                    256,
                    0
                );
        }

        return GenericGF._QR_CODE_FIELD_256;
    }


    /**
     * Data Matrix Reed-Solomon field.
     *
     * GF(256)
     * Primitive polynomial: 0x012D
     */
    static get DATA_MATRIX_FIELD_256() {

        if (!GenericGF._DATA_MATRIX_FIELD_256) {

            GenericGF._DATA_MATRIX_FIELD_256 =
                new GenericGF(
                    0x012D,
                    256,
                    1
                );
        }

        return GenericGF._DATA_MATRIX_FIELD_256;
    }


    /**
     * Aztec 6-bit field.
     */
    static get AZTEC_DATA_6() {

        if (!GenericGF._AZTEC_DATA_6) {

            GenericGF._AZTEC_DATA_6 =
                new GenericGF(
                    0x43,
                    64,
                    1
                );
        }

        return GenericGF._AZTEC_DATA_6;
    }


    /**
     * Aztec 8-bit field.
     */
    static get AZTEC_DATA_8() {

        if (!GenericGF._AZTEC_DATA_8) {

            GenericGF._AZTEC_DATA_8 =
                new GenericGF(
                    0x012D,
                    256,
                    1
                );
        }

        return GenericGF._AZTEC_DATA_8;
    }


    /**
     * Aztec 10-bit field.
     */
    static get AZTEC_DATA_10() {

        if (!GenericGF._AZTEC_DATA_10) {

            GenericGF._AZTEC_DATA_10 =
                new GenericGF(
                    0x409,
                    1024,
                    1
                );
        }

        return GenericGF._AZTEC_DATA_10;
    }


    /**
     * Aztec 12-bit field.
     */
    static get AZTEC_DATA_12() {

        if (!GenericGF._AZTEC_DATA_12) {

            GenericGF._AZTEC_DATA_12 =
                new GenericGF(
                    0x1069,
                    4096,
                    1
                );
        }

        return GenericGF._AZTEC_DATA_12;
    }


    /**
     * Aztec parameter field.
     */
    static get AZTEC_PARAM() {

        if (!GenericGF._AZTEC_PARAM) {

            GenericGF._AZTEC_PARAM =
                new GenericGF(
                    0x13,
                    16,
                    1
                );
        }

        return GenericGF._AZTEC_PARAM;
    }
}