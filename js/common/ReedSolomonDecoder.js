/**
 * ReedSolomonDecoder
 *
 * Generic Reed-Solomon decoder operating over GenericGF.
 *
 * Used by QR Code with:
 *
 * GenericGF.QR_CODE_FIELD_256
 *
 * Requires:
 *
 * - GenericGF.js
 * - GenericGFPoly.js
 */
class ReedSolomonDecoder {

    /**
     * @param {GenericGF} field
     */
    constructor(field) {

        if (!(field instanceof GenericGF)) {
            throw new TypeError(
                "ReedSolomonDecoder requires a GenericGF field."
            );
        }

        this.field = field;
    }


    /**
     * Corrects Reed-Solomon errors in-place.
     *
     * @param {Array<number>|Int32Array|Uint8Array} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {Array<number>|Int32Array|Uint8Array}
     */
    decode(received, errorCorrectionCodewords) {

        if (
            !received ||
            typeof received.length !== "number" ||
            received.length === 0
        ) {
            throw new Error(
                "ReedSolomonDecoder requires received codewords."
            );
        }

        if (
            !Number.isInteger(errorCorrectionCodewords) ||
            errorCorrectionCodewords <= 0
        ) {
            throw new RangeError(
                "Error-correction codeword count must be a positive integer."
            );
        }

        if (
            errorCorrectionCodewords >
            received.length
        ) {
            throw new RangeError(
                "Error-correction codeword count exceeds received data length."
            );
        }


        /*
         * Validate every codeword.
         */
        for (let i = 0; i < received.length; i++) {

            this.field.checkElement(
                received[i]
            );
        }


        /*
         * Treat the received codewords as polynomial
         * coefficients.
         */
        const polynomial =
            new GenericGFPoly(
                this.field,
                received
            );


        /*
         * --------------------------------------------------
         * Calculate syndromes
         * --------------------------------------------------
         *
         * A valid Reed-Solomon block evaluates to zero at
         * every generator root.
         */
        const syndromeCoefficients =
            new Int32Array(
                errorCorrectionCodewords
            );


        let noError = true;


        for (
            let i = 0;
            i < errorCorrectionCodewords;
            i++
        ) {

            const evaluation =
                polynomial.evaluateAt(
                    this.field.exp(
                        i +
                        this.field.getGeneratorBase()
                    )
                );


            /*
             * GenericGFPoly stores coefficients from highest
             * degree to lowest, therefore syndrome values are
             * inserted in reverse order.
             */
            syndromeCoefficients[
                errorCorrectionCodewords -
                1 -
                i
            ] = evaluation;


            if (evaluation !== 0) {
                noError = false;
            }
        }


        /*
         * Nothing needs correcting.
         */
        if (noError) {
            return received;
        }


        const syndrome =
            new GenericGFPoly(
                this.field,
                syndromeCoefficients
            );


        /*
         * --------------------------------------------------
         * Extended Euclidean algorithm
         * --------------------------------------------------
         *
         * Find:
         *
         * sigma = error locator polynomial
         * omega = error evaluator polynomial
         */
        const result =
            this.runEuclideanAlgorithm(
                this.field.buildMonomial(
                    errorCorrectionCodewords,
                    1
                ),
                syndrome,
                errorCorrectionCodewords
            );


        const errorLocator =
            result[0];

        const errorEvaluator =
            result[1];


        /*
         * Find corrupted codeword locations.
         */
        const errorLocations =
            this.findErrorLocations(
                errorLocator
            );


        /*
         * Reed-Solomon with R EC symbols can repair at most
         * floor(R / 2) unknown symbol errors.
         */
        if (
            errorLocations.length >
            Math.floor(
                errorCorrectionCodewords / 2
            )
        ) {
            throw new Error(
                "Too many Reed-Solomon errors to correct."
            );
        }


        /*
         * Calculate the value by which each corrupted
         * codeword must be changed.
         */
        const errorMagnitudes =
            this.findErrorMagnitudes(
                errorEvaluator,
                errorLocations
            );


        /*
         * Apply corrections.
         */
        for (
            let i = 0;
            i < errorLocations.length;
            i++
        ) {

            const log =
                this.field.log(
                    errorLocations[i]
                );


            const position =
                received.length -
                1 -
                log;


            if (
                position < 0 ||
                position >= received.length
            ) {
                throw new Error(
                    "Reed-Solomon error location is outside the received block."
                );
            }


            received[position] =
                this.field.addOrSubtract(
                    received[position],
                    errorMagnitudes[i]
                );
        }


        /*
         * --------------------------------------------------
         * Verify correction
         * --------------------------------------------------
         *
         * Re-evaluate the corrected polynomial. Every
         * syndrome should now be zero.
         */
        const correctedPolynomial =
            new GenericGFPoly(
                this.field,
                received
            );


        for (
            let i = 0;
            i < errorCorrectionCodewords;
            i++
        ) {

            const evaluation =
                correctedPolynomial.evaluateAt(
                    this.field.exp(
                        i +
                        this.field.getGeneratorBase()
                    )
                );


            if (evaluation !== 0) {

                throw new Error(
                    "Reed-Solomon correction failed verification."
                );
            }
        }


        return received;
    }


    /**
     * Extended Euclidean algorithm.
     *
     * Solves the Reed-Solomon key equation and returns:
     *
     * [
     *     errorLocator,
     *     errorEvaluator
     * ]
     *
     * @param {GenericGFPoly} a
     * @param {GenericGFPoly} b
     * @param {number} R
     *
     * @returns {[GenericGFPoly, GenericGFPoly]}
     */
    runEuclideanAlgorithm(a, b, R) {

        if (
            !(a instanceof GenericGFPoly) ||
            !(b instanceof GenericGFPoly)
        ) {
            throw new TypeError(
                "runEuclideanAlgorithm requires GenericGFPoly arguments."
            );
        }

        if (
            !Number.isInteger(R) ||
            R <= 0
        ) {
            throw new RangeError(
                "Reed-Solomon R must be a positive integer."
            );
        }


        /*
         * Ensure a has the greater degree.
         */
        if (
            a.getDegree() <
            b.getDegree()
        ) {

            const temp = a;

            a = b;
            b = temp;
        }


        let rLast = a;
        let r = b;

        let tLast =
            this.field.getZero();

        let t =
            this.field.getOne();


        /*
         * Continue until:
         *
         * degree(r) < R / 2
         */
        while (
            r.getDegree() >=
            Math.floor(R / 2)
        ) {

            const rLastLast =
                rLast;

            const tLastLast =
                tLast;


            rLast = r;
            tLast = t;


            if (rLast.isZero()) {

                throw new Error(
                    "Reed-Solomon Euclidean algorithm reached zero."
                );
            }


            r = rLastLast;


            let q =
                this.field.getZero();


            const denominatorLeadingTerm =
                rLast.getCoefficient(
                    rLast.getDegree()
                );


            const inverseDenominatorLeadingTerm =
                this.field.inverse(
                    denominatorLeadingTerm
                );


            /*
             * Polynomial long division.
             */
            while (
                r.getDegree() >=
                    rLast.getDegree() &&
                !r.isZero()
            ) {

                const degreeDifference =
                    r.getDegree() -
                    rLast.getDegree();


                const scale =
                    this.field.multiply(
                        r.getCoefficient(
                            r.getDegree()
                        ),
                        inverseDenominatorLeadingTerm
                    );


                q =
                    q.addOrSubtract(
                        this.field.buildMonomial(
                            degreeDifference,
                            scale
                        )
                    );


                r =
                    r.addOrSubtract(
                        rLast.multiplyByMonomial(
                            degreeDifference,
                            scale
                        )
                    );
            }


            /*
             * t = q * tLast + tLastLast
             *
             * Addition and subtraction are identical in
             * characteristic-two fields.
             */
            t =
                q.multiply(
                    tLast
                ).addOrSubtract(
                    tLastLast
                );


            /*
             * Polynomial division must reduce the degree.
             */
            if (
                r.getDegree() >=
                rLast.getDegree()
            ) {

                throw new Error(
                    "Reed-Solomon Euclidean algorithm failed to reduce polynomial degree."
                );
            }
        }


        /*
         * Normalise the error locator polynomial so its
         * constant coefficient is one.
         */
        const sigmaTildeAtZero =
            t.getCoefficient(0);


        if (
            sigmaTildeAtZero === 0
        ) {

            throw new Error(
                "Reed-Solomon error locator has zero constant coefficient."
            );
        }


        const inverse =
            this.field.inverse(
                sigmaTildeAtZero
            );


        const sigma =
            t.multiplyScalar(
                inverse
            );


        const omega =
            r.multiplyScalar(
                inverse
            );


        return [
            sigma,
            omega
        ];
    }


    /**
     * Finds error locations using a Chien search.
     *
     * Returned values are field elements representing the
     * locations of corrupted codewords.
     *
     * @param {GenericGFPoly} errorLocator
     *
     * @returns {Int32Array}
     */
    findErrorLocations(errorLocator) {

        if (
            !(errorLocator instanceof GenericGFPoly)
        ) {
            throw new TypeError(
                "findErrorLocations requires a GenericGFPoly."
            );
        }


        const numberOfErrors =
            errorLocator.getDegree();


        if (numberOfErrors === 0) {

            return new Int32Array(0);
        }


        /*
         * For a degree-one locator:
         *
         * sigma(x) = ax + b
         *
         * Once normalised, ZXing-style implementations can
         * return coefficient(1) directly.
         */
        if (numberOfErrors === 1) {

            return Int32Array.of(
                errorLocator.getCoefficient(1)
            );
        }


        const result =
            new Int32Array(
                numberOfErrors
            );


        let errorCount = 0;


        /*
         * Chien search.
         *
         * Search every non-zero field element for roots of
         * sigma(x).
         */
        for (
            let i = 1;
            i < this.field.getSize();
            i++
        ) {

            if (
                errorLocator.evaluateAt(i) === 0
            ) {

                result[errorCount] =
                    this.field.inverse(i);


                errorCount++;


                if (
                    errorCount ===
                    numberOfErrors
                ) {
                    break;
                }
            }
        }


        if (
            errorCount !==
            numberOfErrors
        ) {

            throw new Error(
                "Unable to locate all Reed-Solomon errors."
            );
        }


        return result;
    }


    /**
     * Calculates error magnitudes using Forney's formula.
     *
     * @param {GenericGFPoly} errorEvaluator
     * @param {Int32Array|Array<number>} errorLocations
     *
     * @returns {Int32Array}
     */
    findErrorMagnitudes(
        errorEvaluator,
        errorLocations
    ) {

        if (
            !(errorEvaluator instanceof GenericGFPoly)
        ) {
            throw new TypeError(
                "findErrorMagnitudes requires a GenericGFPoly."
            );
        }


        if (
            !errorLocations ||
            typeof errorLocations.length !== "number"
        ) {
            throw new TypeError(
                "findErrorMagnitudes requires error locations."
            );
        }


        const count =
            errorLocations.length;


        const result =
            new Int32Array(
                count
            );


        for (
            let i = 0;
            i < count;
            i++
        ) {

            const xiInverse =
                this.field.inverse(
                    errorLocations[i]
                );


            let denominator = 1;


            /*
             * Product:
             *
             * Π (1 - Xj * Xi^-1)
             *
             * In GF(2^m), subtraction is XOR.
             */
            for (
                let j = 0;
                j < count;
                j++
            ) {

                if (i === j) {
                    continue;
                }


                const product =
                    this.field.multiply(
                        errorLocations[j],
                        xiInverse
                    );


                /*
                 * Equivalent to:
                 *
                 * 1 XOR product
                 */
                const term =
                    this.field.addOrSubtract(
                        1,
                        product
                    );


                denominator =
                    this.field.multiply(
                        denominator,
                        term
                    );
            }


            if (denominator === 0) {

                throw new Error(
                    "Reed-Solomon error magnitude denominator is zero."
                );
            }


            let magnitude =
                this.field.multiply(
                    errorEvaluator.evaluateAt(
                        xiInverse
                    ),
                    this.field.inverse(
                        denominator
                    )
                );


            /*
             * Required for fields whose generator base is
             * non-zero.
             *
             * QR uses generator base 0, so this does not alter
             * normal QR decoding.
             */
            if (
                this.field.getGeneratorBase() !== 0
            ) {

                magnitude =
                    this.field.multiply(
                        magnitude,
                        xiInverse
                    );
            }


            result[i] =
                magnitude;
        }


        return result;
    }


    /**
     * Calculates syndrome values without modifying the input.
     *
     * Handy for debugging QR decoding.
     *
     * @param {Array<number>|Int32Array|Uint8Array} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {Int32Array}
     */
    calculateSyndromes(
        received,
        errorCorrectionCodewords
    ) {

        if (
            !received ||
            typeof received.length !== "number"
        ) {
            throw new TypeError(
                "calculateSyndromes requires received codewords."
            );
        }


        if (
            !Number.isInteger(errorCorrectionCodewords) ||
            errorCorrectionCodewords < 0
        ) {
            throw new RangeError(
                "Invalid error-correction codeword count."
            );
        }


        const polynomial =
            new GenericGFPoly(
                this.field,
                received
            );


        const syndromes =
            new Int32Array(
                errorCorrectionCodewords
            );


        for (
            let i = 0;
            i < errorCorrectionCodewords;
            i++
        ) {

            syndromes[i] =
                polynomial.evaluateAt(
                    this.field.exp(
                        i +
                        this.field.getGeneratorBase()
                    )
                );
        }


        return syndromes;
    }


    /**
     * Returns true when every Reed-Solomon syndrome is zero.
     *
     * @param {Array<number>|Int32Array|Uint8Array} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {boolean}
     */
    isValid(
        received,
        errorCorrectionCodewords
    ) {

        const syndromes =
            this.calculateSyndromes(
                received,
                errorCorrectionCodewords
            );


        for (
            let i = 0;
            i < syndromes.length;
            i++
        ) {

            if (syndromes[i] !== 0) {
                return false;
            }
        }


        return true;
    }


    /**
     * Returns the Galois Field used by this decoder.
     *
     * @returns {GenericGF}
     */
    getField() {

        return this.field;
    }
}