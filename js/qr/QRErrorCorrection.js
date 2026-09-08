/**
 * QRErrorDetection
 *
 * Provides validation and error-detection helpers for QR Code
 * decoding.
 *
 * This class does NOT perform Reed-Solomon correction itself.
 * That belongs to QRErrorCorrection / ReedSolomonDecoder.
 *
 * Responsibilities:
 *
 * - Calculate QR Reed-Solomon syndromes
 * - Detect whether a codeword block contains errors
 * - Validate corrected blocks
 * - Compare received/corrected blocks
 * - Validate QR codeword ranges
 * - Validate data/EC block dimensions
 *
 * Requires:
 *
 * - GenericGF.js
 * - GenericGFPoly.js
 *
 * Uses:
 *
 * GenericGF.QR_CODE_FIELD_256
 */
class QRErrorDetection {

    /**
     * @param {GenericGF|null} field
     */
    constructor(field = null) {

        if (field === null) {

            if (
                typeof GenericGF ===
                "undefined"
            ) {
                throw new Error(
                    "GenericGF.js must be loaded before QRErrorDetection."
                );
            }

            field =
                GenericGF.QR_CODE_FIELD_256;
        }


        if (
            !(field instanceof GenericGF)
        ) {
            throw new TypeError(
                "QRErrorDetection requires a GenericGF field."
            );
        }


        this.field = field;
    }


    /**
     * Detects whether a QR Reed-Solomon block contains
     * errors.
     *
     * @param {Array<number>|Uint8Array|Int32Array} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {boolean}
     */
    hasErrors(
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
                return true;
            }
        }


        return false;
    }


    /**
     * Returns true when a QR block contains no detectable
     * Reed-Solomon errors.
     *
     * @param {Array<number>|Uint8Array|Int32Array} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {boolean}
     */
    isValid(
        received,
        errorCorrectionCodewords
    ) {

        return !this.hasErrors(
            received,
            errorCorrectionCodewords
        );
    }


    /**
     * Calculates Reed-Solomon syndrome values for a QR
     * codeword block.
     *
     * For a valid block every syndrome must equal zero.
     *
     * QR Code uses:
     *
     * GF(256)
     * primitive polynomial 0x011D
     * generator base 0
     *
     * @param {Array<number>|Uint8Array|Int32Array} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {Int32Array}
     */
    calculateSyndromes(
        received,
        errorCorrectionCodewords
    ) {

        this.validateBlock(
            received,
            errorCorrectionCodewords
        );


        if (
            typeof GenericGFPoly ===
            "undefined"
        ) {
            throw new Error(
                "GenericGFPoly.js must be loaded before calculating QR syndromes."
            );
        }


        const coefficients =
            new Int32Array(
                received.length
            );


        for (
            let i = 0;
            i < received.length;
            i++
        ) {

            coefficients[i] =
                received[i] &
                0xFF;
        }


        const polynomial =
            new GenericGFPoly(
                this.field,
                coefficients
            );


        const syndromes =
            new Int32Array(
                errorCorrectionCodewords
            );


        /*
         * This mirrors the syndrome calculation used by
         * ReedSolomonDecoder.
         *
         * The order is reversed so that syndrome[0]
         * corresponds to the highest syndrome polynomial
         * coefficient.
         */
        for (
            let i = 0;
            i < errorCorrectionCodewords;
            i++
        ) {

            const evaluationPoint =
                this.field.exp(
                    i +
                    this.field
                        .getGeneratorBase()
                );


            const evaluation =
                polynomial.evaluateAt(
                    evaluationPoint
                );


            syndromes[
                errorCorrectionCodewords -
                1 -
                i
            ] =
                evaluation;
        }


        return syndromes;
    }


    /**
     * Counts non-zero syndrome values.
     *
     * NOTE:
     *
     * This is useful as a diagnostic measure, but it is NOT
     * the same thing as the number of corrupted codewords.
     *
     * @param {Array<number>|Uint8Array|Int32Array} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {number}
     */
    countNonZeroSyndromes(
        received,
        errorCorrectionCodewords
    ) {

        const syndromes =
            this.calculateSyndromes(
                received,
                errorCorrectionCodewords
            );


        let count = 0;


        for (
            let i = 0;
            i < syndromes.length;
            i++
        ) {

            if (syndromes[i] !== 0) {
                count++;
            }
        }


        return count;
    }


    /**
     * Returns detailed diagnostic information for one
     * Reed-Solomon block.
     *
     * @param {Array<number>|Uint8Array|Int32Array} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {Object}
     */
    analyse(
        received,
        errorCorrectionCodewords
    ) {

        const syndromes =
            this.calculateSyndromes(
                received,
                errorCorrectionCodewords
            );


        let nonZeroSyndromes = 0;


        for (
            let i = 0;
            i < syndromes.length;
            i++
        ) {

            if (syndromes[i] !== 0) {
                nonZeroSyndromes++;
            }
        }


        return {

            valid:
                nonZeroSyndromes === 0,

            hasErrors:
                nonZeroSyndromes !== 0,

            syndromes:
                syndromes,

            nonZeroSyndromes:
                nonZeroSyndromes,

            totalCodewords:
                received.length,

            errorCorrectionCodewords:
                errorCorrectionCodewords,

            dataCodewords:
                received.length -
                errorCorrectionCodewords,

            correctionCapacity:
                Math.floor(
                    errorCorrectionCodewords /
                    2
                )
        };
    }


    /**
     * American spelling alias.
     *
     * @param {*} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {Object}
     */
    analyze(
        received,
        errorCorrectionCodewords
    ) {

        return this.analyse(
            received,
            errorCorrectionCodewords
        );
    }


    /**
     * Validates that a corrected block now has zero
     * syndromes.
     *
     * Useful immediately after QRErrorCorrection.
     *
     * @param {Array<number>|Uint8Array|Int32Array} corrected
     * @param {number} errorCorrectionCodewords
     *
     * @returns {boolean}
     */
    validateCorrection(
        corrected,
        errorCorrectionCodewords
    ) {

        return this.isValid(
            corrected,
            errorCorrectionCodewords
        );
    }


    /**
     * Compares a received block with a corrected block.
     *
     * Returns the locations and values of changed
     * codewords.
     *
     * @param {Array<number>|Uint8Array|Int32Array} original
     * @param {Array<number>|Uint8Array|Int32Array} corrected
     *
     * @returns {Object}
     */
    compareBlocks(
        original,
        corrected
    ) {

        this.validateCodewords(
            original
        );


        this.validateCodewords(
            corrected
        );


        if (
            original.length !==
            corrected.length
        ) {
            throw new Error(
                "Original and corrected QR blocks must have the same length."
            );
        }


        const differences = [];


        for (
            let i = 0;
            i < original.length;
            i++
        ) {

            const before =
                original[i] &
                0xFF;


            const after =
                corrected[i] &
                0xFF;


            if (before !== after) {

                differences.push({

                    index:
                        i,

                    original:
                        before,

                    corrected:
                        after
                });
            }
        }


        return {

            changed:
                differences.length > 0,

            correctedCodewords:
                differences.length,

            differences:
                differences
        };
    }


    /**
     * Returns the indexes of all non-zero syndromes.
     *
     * Mainly useful for debugging and tests.
     *
     * @param {*} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {number[]}
     */
    getNonZeroSyndromeIndexes(
        received,
        errorCorrectionCodewords
    ) {

        const syndromes =
            this.calculateSyndromes(
                received,
                errorCorrectionCodewords
            );


        const indexes = [];


        for (
            let i = 0;
            i < syndromes.length;
            i++
        ) {

            if (syndromes[i] !== 0) {
                indexes.push(i);
            }
        }


        return indexes;
    }


    /**
     * Returns the maximum number of unknown codeword errors
     * that can theoretically be corrected from the supplied
     * number of Reed-Solomon EC codewords.
     *
     * t = floor(ecCodewords / 2)
     *
     * @param {number} errorCorrectionCodewords
     *
     * @returns {number}
     */
    getCorrectionCapacity(
        errorCorrectionCodewords
    ) {

        if (
            !Number.isInteger(
                errorCorrectionCodewords
            ) ||
            errorCorrectionCodewords < 0
        ) {
            throw new RangeError(
                "Error correction codeword count must be a non-negative integer."
            );
        }


        return Math.floor(
            errorCorrectionCodewords /
            2
        );
    }


    /**
     * Validates a QR codeword array.
     *
     * Every QR codeword must be an integer in the range
     * 0-255.
     *
     * @param {Array<number>|Uint8Array|Int32Array} codewords
     *
     * @returns {boolean}
     */
    validateCodewords(
        codewords
    ) {

        if (
            !codewords ||
            typeof codewords.length !==
                "number"
        ) {
            throw new TypeError(
                "QR codewords must be an array or typed array."
            );
        }


        if (
            codewords.length === 0
        ) {
            throw new Error(
                "QR codeword array cannot be empty."
            );
        }


        for (
            let i = 0;
            i < codewords.length;
            i++
        ) {

            const value =
                codewords[i];


            if (
                !Number.isInteger(value) ||
                value < 0 ||
                value > 255
            ) {
                throw new RangeError(
                    `Invalid QR codeword at index ${i}: ${value}`
                );
            }
        }


        return true;
    }


    /**
     * Validates a complete Reed-Solomon block.
     *
     * @param {*} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {boolean}
     */
    validateBlock(
        received,
        errorCorrectionCodewords
    ) {

        this.validateCodewords(
            received
        );


        if (
            !Number.isInteger(
                errorCorrectionCodewords
            ) ||
            errorCorrectionCodewords <= 0
        ) {
            throw new RangeError(
                "QR error correction codeword count must be a positive integer."
            );
        }


        if (
            errorCorrectionCodewords >=
            received.length
        ) {
            throw new RangeError(
                "QR error correction codeword count must be smaller than the block length."
            );
        }


        return true;
    }


    /**
     * Checks a QRDataBlock object.
     *
     * @param {QRDataBlock|Object} block
     *
     * @returns {Object}
     */
    analyseDataBlock(
        block
    ) {

        if (!block) {
            throw new TypeError(
                "A QR data block is required."
            );
        }


        let codewords;

        let dataCodewords;


        if (
            typeof block
                .getCodewords ===
            "function"
        ) {

            codewords =
                block.getCodewords();

        } else {

            codewords =
                block.codewords;
        }


        if (
            typeof block
                .getNumDataCodewords ===
            "function"
        ) {

            dataCodewords =
                block
                    .getNumDataCodewords();

        } else {

            dataCodewords =
                block.numDataCodewords;
        }


        if (
            !Number.isInteger(
                dataCodewords
            )
        ) {
            throw new Error(
                "QR data block does not expose its data codeword count."
            );
        }


        const errorCorrectionCodewords =
            codewords.length -
            dataCodewords;


        return this.analyse(
            codewords,
            errorCorrectionCodewords
        );
    }


    /**
     * Checks every QRDataBlock and returns aggregate
     * diagnostic information.
     *
     * @param {Array} blocks
     *
     * @returns {Object}
     */
    analyseDataBlocks(
        blocks
    ) {

        if (
            !Array.isArray(blocks) ||
            blocks.length === 0
        ) {
            throw new TypeError(
                "analyseDataBlocks requires a non-empty block array."
            );
        }


        const blockResults =
            new Array(
                blocks.length
            );


        let blocksWithErrors = 0;

        let totalNonZeroSyndromes = 0;

        let totalCodewords = 0;

        let totalDataCodewords = 0;

        let totalErrorCorrectionCodewords = 0;


        for (
            let i = 0;
            i < blocks.length;
            i++
        ) {

            const result =
                this.analyseDataBlock(
                    blocks[i]
                );


            blockResults[i] =
                result;


            if (result.hasErrors) {
                blocksWithErrors++;
            }


            totalNonZeroSyndromes +=
                result.nonZeroSyndromes;


            totalCodewords +=
                result.totalCodewords;


            totalDataCodewords +=
                result.dataCodewords;


            totalErrorCorrectionCodewords +=
                result.errorCorrectionCodewords;
        }


        return {

            valid:
                blocksWithErrors === 0,

            hasErrors:
                blocksWithErrors > 0,

            totalBlocks:
                blocks.length,

            blocksWithErrors:
                blocksWithErrors,

            totalNonZeroSyndromes:
                totalNonZeroSyndromes,

            totalCodewords:
                totalCodewords,

            totalDataCodewords:
                totalDataCodewords,

            totalErrorCorrectionCodewords:
                totalErrorCorrectionCodewords,

            blocks:
                blockResults
        };
    }


    /**
     * Returns a copy of the syndrome array as a regular
     * JavaScript array.
     *
     * Convenient for logging and unit tests.
     *
     * @param {*} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {number[]}
     */
    getSyndromeArray(
        received,
        errorCorrectionCodewords
    ) {

        return Array.from(
            this.calculateSyndromes(
                received,
                errorCorrectionCodewords
            )
        );
    }


    /**
     * Returns the Galois field used for QR error detection.
     *
     * @returns {GenericGF}
     */
    getField() {

        return this.field;
    }


    /**
     * Static convenience method.
     *
     * @param {*} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {boolean}
     */
    static hasErrors(
        received,
        errorCorrectionCodewords
    ) {

        return new QRErrorDetection()
            .hasErrors(
                received,
                errorCorrectionCodewords
            );
    }


    /**
     * Static convenience method.
     *
     * @param {*} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {boolean}
     */
    static isValid(
        received,
        errorCorrectionCodewords
    ) {

        return new QRErrorDetection()
            .isValid(
                received,
                errorCorrectionCodewords
            );
    }


    /**
     * Static convenience method.
     *
     * @param {*} received
     * @param {number} errorCorrectionCodewords
     *
     * @returns {Int32Array}
     */
    static calculateSyndromes(
        received,
        errorCorrectionCodewords
    ) {

        return new QRErrorDetection()
            .calculateSyndromes(
                received,
                errorCorrectionCodewords
            );
    }
}