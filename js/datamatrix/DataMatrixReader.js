/**
 * DataMatrixReader
 *
 * High-level ECC200 Data Matrix reader.
 *
 * Pipeline:
 *
 * BitMatrix
 *     ↓
 * DataMatrixDetector
 *     ↓
 * Sampled Data Matrix symbol
 *     ↓
 * DataMatrixSymbolInfo
 *     ↓
 * DataMatrixCodewordReader
 *     ↓
 * Raw codewords
 *     ↓
 * DataMatrixErrorCorrection
 *     ↓
 * Corrected data codewords
 *     ↓
 * DataMatrixDecoder
 *     ↓
 * Decoded result
 *
 * Requires:
 *
 * - BitMatrix.js
 * - DataMatrixDetector.js
 * - DataMatrixSymbolInfo.js
 * - DataMatrixCodewordReader.js
 * - DataMatrixErrorCorrection.js
 * - DataMatrixDecoder.js
 *
 * Browser-global class.
 */
class DataMatrixReader {

    /**
     * @param {Object} options
     */
    constructor(options = {}) {

        this.options = {
            ...options
        };


        /*
         * -----------------------------------------------------
         * DEPENDENCY CHECKS
         * -----------------------------------------------------
         */

        this.checkDependencies();


        /*
         * -----------------------------------------------------
         * COMPONENTS
         * -----------------------------------------------------
         */

        this.detector =
            new DataMatrixDetector(
                options.detector || {}
            );


        this.codewordReader =
            new DataMatrixCodewordReader();


        this.errorCorrection =
            new DataMatrixErrorCorrection();


        this.decoder =
            new DataMatrixDecoder();


        /*
         * -----------------------------------------------------
         * LAST DECODE STATE
         * -----------------------------------------------------
         */

        this.lastResult =
            null;

        this.lastDetection =
            null;

        this.lastSymbolInfo =
            null;

        this.lastRawCodewords =
            null;

        this.lastCorrectedCodewords =
            null;
    }


    /**
     * Main Data Matrix decoding entry point.
     *
     * @param {BitMatrix} matrix
     *
     * @returns {Object}
     */
    decode(matrix) {

        if (
            typeof BitMatrix === "undefined" ||
            !(matrix instanceof BitMatrix)
        ) {

            throw new TypeError(
                "DataMatrixReader.decode requires a BitMatrix."
            );
        }


        /*
         * Reset state from previous decode.
         */
        this.resetState();


        /*
         * =====================================================
         * STEP 1
         *
         * Detect and sample the Data Matrix symbol.
         * =====================================================
         */

        const detection =
            this.detector.detect(
                matrix
            );


        if (
            !detection ||
            !detection.matrix
        ) {

            throw new Error(
                "Data Matrix detector returned no symbol."
            );
        }


        if (
            !(detection.matrix instanceof BitMatrix)
        ) {

            throw new Error(
                "Data Matrix detector returned an invalid matrix."
            );
        }


        this.lastDetection =
            detection;


        /*
         * =====================================================
         * STEP 2
         *
         * Determine ECC200 symbol information.
         * =====================================================
         */

        const symbolWidth =
            this.getDetectedWidth(
                detection
            );


        const symbolHeight =
            this.getDetectedHeight(
                detection
            );


        const symbolInfo =
            this.lookupSymbolInfo(
                symbolWidth,
                symbolHeight
            );


        this.lastSymbolInfo =
            symbolInfo;


        /*
         * =====================================================
         * STEP 3
         *
         * Extract raw codewords from the sampled symbol.
         * =====================================================
         */

        const rawCodewords =
            this.codewordReader.read(
                detection.matrix,
                symbolInfo
            );


        if (
            !rawCodewords ||
            typeof rawCodewords.length !==
                "number"
        ) {

            throw new Error(
                "Data Matrix codeword reader returned invalid data."
            );
        }


        this.lastRawCodewords =
            Uint8Array.from(
                rawCodewords
            );


        /*
         * =====================================================
         * STEP 4
         *
         * Reed-Solomon error correction.
         * =====================================================
         */

        const correctedCodewords =
            this.errorCorrection.correct(
                rawCodewords,
                symbolInfo
            );


        if (
            !correctedCodewords ||
            typeof correctedCodewords.length !==
                "number"
        ) {

            throw new Error(
                "Data Matrix error correction returned invalid data."
            );
        }


        this.lastCorrectedCodewords =
            Uint8Array.from(
                correctedCodewords
            );


        /*
         * =====================================================
         * STEP 5
         *
         * Decode the corrected payload.
         * =====================================================
         */

        const decoded =
            this.decoder.decode(
                correctedCodewords
            );


        /*
         * =====================================================
         * STEP 6
         *
         * Normalise the result for BarcodeReader.
         * =====================================================
         */

        const result =
            this.createResult(
                decoded,
                detection,
                symbolInfo,
                rawCodewords,
                correctedCodewords
            );


        this.lastResult =
            result;


        return result;
    }


    /**
     * Alias for decode().
     *
     * BarcodeReader may use either decode() or read().
     *
     * @param {BitMatrix} matrix
     *
     * @returns {Object}
     */
    read(matrix) {

        return this.decode(
            matrix
        );
    }


    /**
     * Safe decoding helper.
     *
     * Returns null rather than throwing when the supplied
     * matrix does not contain a readable Data Matrix symbol.
     *
     * @param {BitMatrix} matrix
     *
     * @returns {Object|null}
     */
    tryDecode(matrix) {

        try {

            return this.decode(
                matrix
            );

        } catch (error) {

            return null;
        }
    }


    /*
     * =========================================================
     * SYMBOL INFORMATION
     * =========================================================
     */

    /**
     * Finds DataMatrixSymbolInfo for the detected dimensions.
     *
     * Supports several method names so the reader remains
     * tolerant of minor changes to DataMatrixSymbolInfo.
     *
     * @param {number} width
     * @param {number} height
     *
     * @returns {Object}
     */
    lookupSymbolInfo(
        width,
        height
    ) {

        if (
            typeof DataMatrixSymbolInfo ===
            "undefined"
        ) {

            throw new Error(
                "DataMatrixSymbolInfo.js must be loaded before decoding."
            );
        }


        /*
         * Preferred API.
         */
        if (
            typeof DataMatrixSymbolInfo
                .forDimensions ===
            "function"
        ) {

            const info =
                DataMatrixSymbolInfo
                    .forDimensions(
                        width,
                        height
                    );


            if (info) {

                return info;
            }
        }


        /*
         * Alternative lookup API.
         */
        if (
            typeof DataMatrixSymbolInfo
                .lookup ===
            "function"
        ) {

            const info =
                DataMatrixSymbolInfo
                    .lookup(
                        width,
                        height
                    );


            if (info) {

                return info;
            }
        }


        /*
         * Alternative name.
         */
        if (
            typeof DataMatrixSymbolInfo
                .getSymbolInfo ===
            "function"
        ) {

            const info =
                DataMatrixSymbolInfo
                    .getSymbolInfo(
                        width,
                        height
                    );


            if (info) {

                return info;
            }
        }


        /*
         * Fall back to searching a public SYMBOLS array.
         */
        if (
            Array.isArray(
                DataMatrixSymbolInfo.SYMBOLS
            )
        ) {

            for (
                let i = 0;
                i <
                DataMatrixSymbolInfo
                    .SYMBOLS.length;
                i++
            ) {

                const info =
                    DataMatrixSymbolInfo
                        .SYMBOLS[i];


                const infoWidth =
                    this.getInfoNumber(
                        info,
                        [
                            "symbolColumns",
                            "columns",
                            "symbolWidth"
                        ]
                    );


                const infoHeight =
                    this.getInfoNumber(
                        info,
                        [
                            "symbolRows",
                            "rows",
                            "symbolHeight"
                        ]
                    );


                if (
                    infoWidth === width &&
                    infoHeight === height
                ) {

                    return info;
                }
            }
        }


        throw new Error(
            "Unsupported Data Matrix symbol dimensions: " +
            `${width}x${height}.`
        );
    }


    /*
     * =========================================================
     * DETECTOR DIMENSIONS
     * =========================================================
     */

    /**
     * Returns detected symbol width.
     *
     * @param {Object} detection
     *
     * @returns {number}
     */
    getDetectedWidth(
        detection
    ) {

        const width =
            this.firstValidInteger(
                [
                    detection.columns,
                    detection.width,
                    detection.matrix
                        ? detection.matrix.width
                        : null
                ]
            );


        if (
            width === null
        ) {

            throw new Error(
                "Unable to determine Data Matrix symbol width."
            );
        }


        return width;
    }


    /**
     * Returns detected symbol height.
     *
     * @param {Object} detection
     *
     * @returns {number}
     */
    getDetectedHeight(
        detection
    ) {

        const height =
            this.firstValidInteger(
                [
                    detection.rows,
                    detection.height,
                    detection.matrix
                        ? detection.matrix.height
                        : null
                ]
            );


        if (
            height === null
        ) {

            throw new Error(
                "Unable to determine Data Matrix symbol height."
            );
        }


        return height;
    }


    /*
     * =========================================================
     * RESULT
     * =========================================================
     */

    /**
     * Converts DataMatrixDecoder output into a result suitable
     * for the high-level BarcodeReader.
     *
     * @returns {Object}
     */
    createResult(
        decoded,
        detection,
        symbolInfo,
        rawCodewords,
        correctedCodewords
    ) {

        /*
         * DataMatrixDecoder normally returns an object.
         *
         * Also support a plain string for compatibility with
         * simpler decoder implementations.
         */
        let text;
        let bytes;
        let fnc1 = false;
        let macro = null;


        if (
            typeof decoded ===
            "string"
        ) {

            text =
                decoded;

            bytes =
                this.stringToBytes(
                    decoded
                );

        } else if (
            decoded &&
            typeof decoded ===
                "object"
        ) {

            text =
                decoded.text !== undefined
                    ? String(
                        decoded.text
                    )
                    : "";


            if (
                decoded.bytes &&
                typeof decoded.bytes.length ===
                    "number"
            ) {

                bytes =
                    Uint8Array.from(
                        decoded.bytes
                    );

            } else {

                bytes =
                    this.stringToBytes(
                        text
                    );
            }


            fnc1 =
                decoded.fnc1 ===
                true;


            macro =
                decoded.macro !==
                undefined
                    ? decoded.macro
                    : null;

        } else {

            throw new Error(
                "Data Matrix decoder returned an invalid result."
            );
        }


        const width =
            this.getDetectedWidth(
                detection
            );


        const height =
            this.getDetectedHeight(
                detection
            );


        return {

            /*
             * BarcodeReader can use this directly when
             * normalising its result.
             */
            format:
                "DATA_MATRIX",

            text:
                text,

            bytes:
                bytes,

            /*
             * Detector points are useful for future UI overlays.
             */
            points:
                Array.isArray(
                    detection.points
                )
                    ? detection.points
                    : [],

            /*
             * Symbol metadata.
             */
            width:
                width,

            height:
                height,

            rows:
                height,

            columns:
                width,

            fnc1:
                fnc1,

            macro:
                macro,

            /*
             * Retaining these is useful while the hand-written
             * scanner is being tested/debugged.
             */
            rawCodewords:
                Uint8Array.from(
                    rawCodewords
                ),

            correctedCodewords:
                Uint8Array.from(
                    correctedCodewords
                ),

            symbolInfo:
                symbolInfo
        };
    }


    /*
     * =========================================================
     * DEPENDENCIES
     * =========================================================
     */

    /**
     * Verifies that every Data Matrix component has been loaded.
     */
    checkDependencies() {

        if (
            typeof BitMatrix ===
            "undefined"
        ) {

            throw new Error(
                "BitMatrix.js must be loaded before DataMatrixReader.js."
            );
        }


        if (
            typeof DataMatrixDetector ===
            "undefined"
        ) {

            throw new Error(
                "DataMatrixDetector.js must be loaded before DataMatrixReader.js."
            );
        }


        if (
            typeof DataMatrixSymbolInfo ===
            "undefined"
        ) {

            throw new Error(
                "DataMatrixSymbolInfo.js must be loaded before DataMatrixReader.js."
            );
        }


        if (
            typeof DataMatrixCodewordReader ===
            "undefined"
        ) {

            throw new Error(
                "DataMatrixCodewordReader.js must be loaded before DataMatrixReader.js."
            );
        }


        if (
            typeof DataMatrixErrorCorrection ===
            "undefined"
        ) {

            throw new Error(
                "DataMatrixErrorCorrection.js must be loaded before DataMatrixReader.js."
            );
        }


        if (
            typeof DataMatrixDecoder ===
            "undefined"
        ) {

            throw new Error(
                "DataMatrixDecoder.js must be loaded before DataMatrixReader.js."
            );
        }
    }


    /*
     * =========================================================
     * STATE
     * =========================================================
     */

    /**
     * Clears information from the previous decode.
     */
    resetState() {

        this.lastResult =
            null;

        this.lastDetection =
            null;

        this.lastSymbolInfo =
            null;

        this.lastRawCodewords =
            null;

        this.lastCorrectedCodewords =
            null;
    }


    /**
     * Returns the last successful result.
     *
     * @returns {Object|null}
     */
    getLastResult() {

        return this.lastResult;
    }


    /**
     * Returns the last detector result.
     *
     * @returns {Object|null}
     */
    getLastDetection() {

        return this.lastDetection;
    }


    /**
     * Returns the last symbol information.
     *
     * @returns {Object|null}
     */
    getLastSymbolInfo() {

        return this.lastSymbolInfo;
    }


    /**
     * Returns a copy of the last raw codewords.
     *
     * @returns {Uint8Array|null}
     */
    getLastRawCodewords() {

        if (
            this.lastRawCodewords ===
            null
        ) {

            return null;
        }


        return new Uint8Array(
            this.lastRawCodewords
        );
    }


    /**
     * Returns a copy of the last corrected data codewords.
     *
     * @returns {Uint8Array|null}
     */
    getLastCorrectedCodewords() {

        if (
            this.lastCorrectedCodewords ===
            null
        ) {

            return null;
        }


        return new Uint8Array(
            this.lastCorrectedCodewords
        );
    }


    /*
     * =========================================================
     * HELPERS
     * =========================================================
     */

    /**
     * Returns the first positive integer in an array.
     *
     * @param {Array} values
     *
     * @returns {number|null}
     */
    firstValidInteger(
        values
    ) {

        for (
            let i = 0;
            i < values.length;
            i++
        ) {

            const value =
                values[i];


            if (
                Number.isInteger(
                    value
                ) &&
                value > 0
            ) {

                return value;
            }
        }


        return null;
    }


    /**
     * Reads a numeric property/getter from symbol information.
     *
     * @param {Object} object
     * @param {string[]} names
     *
     * @returns {number|null}
     */
    getInfoNumber(
        object,
        names
    ) {

        if (!object) {

            return null;
        }


        for (
            let i = 0;
            i < names.length;
            i++
        ) {

            const name =
                names[i];


            if (
                typeof object[name] ===
                "number"
            ) {

                return object[name];
            }


            if (
                typeof object[name] ===
                "function"
            ) {

                const value =
                    object[name]();


                if (
                    typeof value ===
                    "number"
                ) {

                    return value;
                }
            }


            const getter =
                "get" +
                name.charAt(0)
                    .toUpperCase() +
                name.slice(1);


            if (
                typeof object[getter] ===
                "function"
            ) {

                const value =
                    object[getter]();


                if (
                    typeof value ===
                    "number"
                ) {

                    return value;
                }
            }
        }


        return null;
    }


    /**
     * Converts a JavaScript string into a byte array.
     *
     * Primarily a fallback for a decoder implementation that
     * returns only text.
     *
     * @param {string} text
     *
     * @returns {Uint8Array}
     */
    stringToBytes(
        text
    ) {

        const result =
            new Uint8Array(
                text.length
            );


        for (
            let i = 0;
            i < text.length;
            i++
        ) {

            result[i] =
                text.charCodeAt(i) &
                0xFF;
        }


        return result;
    }
}