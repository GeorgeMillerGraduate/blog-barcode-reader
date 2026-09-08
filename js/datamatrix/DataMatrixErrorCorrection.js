/**
 * DataMatrixErrorCorrection
 *
 * Performs ECC200 Reed-Solomon error correction for
 * Data Matrix codewords.
 *
 * Data Matrix ECC200:
 *
 *   GF(256)
 *   Primitive polynomial = 0x12D
 *   Generator base       = 1
 *
 * Input:
 *   Raw codewords from DataMatrixCodewordReader.
 *
 * Output:
 *   Uint8Array containing corrected DATA codewords only.
 *
 * Requires:
 *
 *   GenericGF.js
 *   GenericGFPoly.js
 *   ReedSolomonDecoder.js
 */
class DataMatrixErrorCorrection {

    // =========================================================
    // DEBUG
    // =========================================================

    /**
     * Set to true to enable console diagnostics.
     * Set to false for normal production use.
     */
    static DEBUG = true;


    debug(...args) {

        if (!DataMatrixErrorCorrection.DEBUG) {
            return;
        }

        console.log(
            "[DataMatrixErrorCorrection]",
            ...args
        );
    }


    debugHex(label, values) {

        if (!DataMatrixErrorCorrection.DEBUG) {
            return;
        }

        if (!values) {

            this.debug(
                label,
                "(null)"
            );

            return;
        }

        const hex =
            Array.from(values)
                .map(
                    value =>
                        (Number(value) & 0xFF)
                            .toString(16)
                            .padStart(2, "0")
                            .toUpperCase()
                )
                .join(" ");

        this.debug(
            label,
            hex
        );
    }


    // =========================================================
    // CONSTRUCTOR
    // =========================================================

    constructor() {

        if (
            typeof GenericGF === "undefined"
        ) {

            throw new Error(
                "GenericGF.js must be loaded before DataMatrixErrorCorrection.js."
            );
        }


        if (
            typeof GenericGFPoly === "undefined"
        ) {

            throw new Error(
                "GenericGFPoly.js must be loaded before DataMatrixErrorCorrection.js."
            );
        }


        if (
            typeof ReedSolomonDecoder === "undefined"
        ) {

            throw new Error(
                "ReedSolomonDecoder.js must be loaded before DataMatrixErrorCorrection.js."
            );
        }


        // =====================================================
        // DATA MATRIX ECC200 FIELD
        // =====================================================
        //
        // Primitive polynomial:
        //
        //     x^8 + x^5 + x^3 + x^2 + 1
        //
        // Hex:
        //
        //     0x12D
        //
        // Field size:
        //
        //     256
        //
        // Generator base:
        //
        //     1
        // =====================================================

        this.field =
            new GenericGF(
                0x12D,
                256,
                1
            );


        this.decoder =
            new ReedSolomonDecoder(
                this.field
            );


        this.debug(
            "DataMatrixErrorCorrection created."
        );

        this.debug(
            "GF primitive polynomial: 0x12D"
        );

        this.debug(
            "GF size: 256"
        );

        this.debug(
            "GF generator base: 1"
        );
    }


    // =========================================================
    // PUBLIC API
    // =========================================================

    correct(
        codewords,
        symbolInfo
    ) {

        this.debug(
            "========================================"
        );

        this.debug(
            "START DATA MATRIX ERROR CORRECTION"
        );

        this.debug(
            "========================================"
        );


        // -----------------------------------------------------
        // Validate codeword input
        // -----------------------------------------------------

        if (
            !codewords ||
            typeof codewords.length !== "number" ||
            codewords.length === 0
        ) {

            throw new TypeError(
                "DataMatrixErrorCorrection.correct requires codewords."
            );
        }


        if (!symbolInfo) {

            throw new TypeError(
                "DataMatrixErrorCorrection.correct requires symbol information."
            );
        }


        const received =
            Array.from(
                codewords
            );


        this.debug(
            "Received codeword count:",
            received.length
        );

        this.debugHex(
            "Received codewords HEX:",
            received
        );

        this.debug(
            "Symbol info:",
            symbolInfo
        );


        // -----------------------------------------------------
        // Obtain symbol capacities
        // -----------------------------------------------------

        const dataCodewords =
            this.getInfoNumber(
                symbolInfo,
                [
                    "dataCodewords",
                    "dataCapacity"
                ]
            );


        const errorCodewords =
            this.getInfoNumber(
                symbolInfo,
                [
                    "errorCodewords",
                    "errorCodewordCount",
                    "errorCodewordsCount"
                ]
            );


        this.debug(
            "Data codewords:",
            dataCodewords
        );

        this.debug(
            "Error-correction codewords:",
            errorCodewords
        );


        if (
            dataCodewords === null
        ) {

            throw new Error(
                "Data Matrix symbol information does not specify data codewords."
            );
        }


        if (
            errorCodewords === null
        ) {

            throw new Error(
                "Data Matrix symbol information does not specify error-correction codewords."
            );
        }


        const expectedTotal =
            dataCodewords +
            errorCodewords;


        this.debug(
            "Expected total codewords:",
            expectedTotal
        );

        this.debug(
            "Actual total codewords:",
            received.length
        );


        if (
            received.length !==
            expectedTotal
        ) {

            this.debug(
                "ERROR: RAW CODEWORD COUNT MISMATCH"
            );

            throw new Error(
                "Data Matrix raw codeword count mismatch. " +
                `Expected ${expectedTotal}, received ${received.length}.`
            );
        }


        this.debug(
            "Raw codeword count validation: OK"
        );


        // -----------------------------------------------------
        // Determine RS block count
        // -----------------------------------------------------

        const blockCount =
            this.getBlockCount(
                symbolInfo
            );


        this.debug(
            "Reed-Solomon block count:",
            blockCount
        );


        // -----------------------------------------------------
        // Single RS block
        // -----------------------------------------------------

        if (
            blockCount === 1
        ) {

            this.debug(
                "Using SINGLE BLOCK correction."
            );


            const result =
                this.correctSingleBlock(
                    received,
                    dataCodewords,
                    errorCodewords
                );


            this.debug(
                "========================================"
            );

            this.debug(
                "END DATA MATRIX ERROR CORRECTION"
            );

            this.debug(
                "========================================"
            );


            return result;
        }


        // -----------------------------------------------------
        // Multiple interleaved RS blocks
        // -----------------------------------------------------

        this.debug(
            "Using INTERLEAVED BLOCK correction."
        );


        const result =
            this.correctInterleavedBlocks(
                received,
                symbolInfo,
                dataCodewords,
                errorCodewords,
                blockCount
            );


        this.debug(
            "========================================"
        );

        this.debug(
            "END DATA MATRIX ERROR CORRECTION"
        );

        this.debug(
            "========================================"
        );


        return result;
    }


    /**
     * Alias for correct().
     */
    decode(
        codewords,
        symbolInfo
    ) {

        return this.correct(
            codewords,
            symbolInfo
        );
    }


    // =========================================================
    // SINGLE BLOCK
    // =========================================================

    correctSingleBlock(
        received,
        dataCodewords,
        errorCodewords
    ) {

        this.debug(
            "----------------------------------------"
        );

        this.debug(
            "SINGLE REED-SOLOMON BLOCK"
        );

        this.debug(
            "----------------------------------------"
        );


        const block =
            Int32Array.from(
                received
            );


        this.debug(
            "Block length:",
            block.length
        );

        this.debug(
            "Data bytes in block:",
            dataCodewords
        );

        this.debug(
            "ECC bytes in block:",
            errorCodewords
        );

        this.debug(
            "ECC count passed to ReedSolomonDecoder:",
            errorCodewords
        );


        this.debugHex(
            "Block BEFORE RS:",
            block
        );


        // -----------------------------------------------------
        // Reed-Solomon correction
        // -----------------------------------------------------

        try {

            this.debug(
                "Calling ReedSolomonDecoder.decode()..."
            );


            this.decoder.decode(
                block,
                errorCodewords
            );


            this.debug(
                "REED-SOLOMON SUCCESS"
            );

        } catch (error) {

            this.debug(
                "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
            );

            this.debug(
                "REED-SOLOMON FAILED"
            );

            this.debug(
                "Error:",
                error
            );

            this.debug(
                "Error message:",
                error && error.message
                    ? error.message
                    : String(error)
            );

            this.debug(
                "Block length:",
                block.length
            );

            this.debug(
                "ECC count:",
                errorCodewords
            );

            this.debugHex(
                "Block AT FAILURE:",
                block
            );

            this.debug(
                "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
            );


            throw error;
        }


        this.debugHex(
            "Block AFTER RS:",
            block
        );


        // -----------------------------------------------------
        // Extract corrected DATA codewords
        // -----------------------------------------------------

        const data =
            new Uint8Array(
                dataCodewords
            );


        for (
            let i = 0;
            i < dataCodewords;
            i++
        ) {

            data[i] =
                block[i];
        }


        this.debug(
            "Corrected data codeword count:",
            data.length
        );

        this.debugHex(
            "Corrected DATA codewords:",
            data
        );


        return data;
    }


    // =========================================================
    // INTERLEAVED BLOCKS
    // =========================================================

    correctInterleavedBlocks(
        received,
        symbolInfo,
        dataCodewords,
        errorCodewords,
        blockCount
    ) {

        this.debug(
            "----------------------------------------"
        );

        this.debug(
            "INTERLEAVED REED-SOLOMON BLOCKS"
        );

        this.debug(
            "----------------------------------------"
        );


        // -----------------------------------------------------
        // Determine block sizes
        // -----------------------------------------------------

        const dataLengths =
            this.getDataLengths(
                symbolInfo,
                dataCodewords,
                blockCount
            );


        const errorLengths =
            this.getErrorLengths(
                symbolInfo,
                errorCodewords,
                blockCount
            );


        this.debug(
            "Data lengths per block:",
            dataLengths
        );

        this.debug(
            "ECC lengths per block:",
            errorLengths
        );


        if (
            dataLengths.length !==
            blockCount
        ) {

            throw new Error(
                "Invalid Data Matrix data block information."
            );
        }


        if (
            errorLengths.length !==
            blockCount
        ) {

            throw new Error(
                "Invalid Data Matrix error-correction block information."
            );
        }


        const blocks =
            [];


        for (
            let i = 0;
            i < blockCount;
            i++
        ) {

            blocks.push({

                dataCount:
                    dataLengths[i],

                errorCount:
                    errorLengths[i],

                codewords:
                    new Int32Array(
                        dataLengths[i] +
                        errorLengths[i]
                    )
            });


            this.debug(
                `Block ${i}:`,
                {
                    dataCount:
                        dataLengths[i],

                    errorCount:
                        errorLengths[i],

                    total:
                        dataLengths[i] +
                        errorLengths[i]
                }
            );
        }


        // =====================================================
        // DE-INTERLEAVE DATA CODEWORDS
        // =====================================================

        let offset =
            0;


        const maximumDataLength =
            Math.max(
                ...dataLengths
            );


        this.debug(
            "Maximum data length:",
            maximumDataLength
        );

        this.debug(
            "Beginning DATA de-interleave..."
        );


        for (
            let position = 0;
            position < maximumDataLength;
            position++
        ) {

            for (
                let blockIndex = 0;
                blockIndex < blockCount;
                blockIndex++
            ) {

                const block =
                    blocks[
                        blockIndex
                    ];


                if (
                    position >=
                    block.dataCount
                ) {

                    continue;
                }


                if (
                    offset >=
                    received.length
                ) {

                    throw new Error(
                        "Data Matrix codeword stream ended while de-interleaving data."
                    );
                }


                block.codewords[
                    position
                ] =
                    received[
                        offset++
                    ];
            }
        }


        this.debug(
            "Offset after DATA de-interleave:",
            offset
        );


        // =====================================================
        // DE-INTERLEAVE ECC CODEWORDS
        // =====================================================

        const maximumErrorLength =
            Math.max(
                ...errorLengths
            );


        this.debug(
            "Maximum ECC length:",
            maximumErrorLength
        );

        this.debug(
            "Beginning ECC de-interleave..."
        );


        for (
            let position = 0;
            position < maximumErrorLength;
            position++
        ) {

            for (
                let blockIndex = 0;
                blockIndex < blockCount;
                blockIndex++
            ) {

                const block =
                    blocks[
                        blockIndex
                    ];


                if (
                    position >=
                    block.errorCount
                ) {

                    continue;
                }


                if (
                    offset >=
                    received.length
                ) {

                    throw new Error(
                        "Data Matrix codeword stream ended while de-interleaving error correction."
                    );
                }


                block.codewords[
                    block.dataCount +
                    position
                ] =
                    received[
                        offset++
                    ];
            }
        }


        this.debug(
            "Offset after ECC de-interleave:",
            offset
        );

        this.debug(
            "Total received codewords:",
            received.length
        );


        if (
            offset !==
            received.length
        ) {

            throw new Error(
                "Data Matrix de-interleaving did not consume all codewords."
            );
        }


        this.debug(
            "De-interleaving complete: OK"
        );


        // =====================================================
        // PRINT BLOCKS BEFORE RS
        // =====================================================

        for (
            let i = 0;
            i < blocks.length;
            i++
        ) {

            this.debugHex(
                `Block ${i} BEFORE RS:`,
                blocks[i].codewords
            );
        }


        // =====================================================
        // REED-SOLOMON CORRECTION
        // =====================================================

        for (
            let i = 0;
            i < blocks.length;
            i++
        ) {

            const block =
                blocks[i];


            this.debug(
                `Correcting RS block ${i}...`
            );

            this.debug(
                `Block ${i} length:`,
                block.codewords.length
            );

            this.debug(
                `Block ${i} data count:`,
                block.dataCount
            );

            this.debug(
                `Block ${i} ECC count:`,
                block.errorCount
            );


            try {

                this.decoder.decode(
                    block.codewords,
                    block.errorCount
                );


                this.debug(
                    `Block ${i}: REED-SOLOMON SUCCESS`
                );

            } catch (error) {

                this.debug(
                    "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
                );

                this.debug(
                    `Block ${i}: REED-SOLOMON FAILED`
                );

                this.debug(
                    "Error:",
                    error
                );

                this.debug(
                    "Error message:",
                    error && error.message
                        ? error.message
                        : String(error)
                );

                this.debugHex(
                    `Block ${i} AT FAILURE:`,
                    block.codewords
                );

                this.debug(
                    "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
                );


                throw error;
            }


            this.debugHex(
                `Block ${i} AFTER RS:`,
                block.codewords
            );
        }


        // =====================================================
        // REASSEMBLE CORRECTED DATA
        // =====================================================

        const correctedData =
            new Uint8Array(
                dataCodewords
            );


        let outputOffset =
            0;


        for (
            let position = 0;
            position < maximumDataLength;
            position++
        ) {

            for (
                let blockIndex = 0;
                blockIndex < blockCount;
                blockIndex++
            ) {

                const block =
                    blocks[
                        blockIndex
                    ];


                if (
                    position >=
                    block.dataCount
                ) {

                    continue;
                }


                correctedData[
                    outputOffset++
                ] =
                    block.codewords[
                        position
                    ];
            }
        }


        if (
            outputOffset !==
            dataCodewords
        ) {

            throw new Error(
                "Incorrect number of corrected Data Matrix data codewords."
            );
        }


        this.debug(
            "Corrected output count:",
            outputOffset
        );

        this.debugHex(
            "Corrected DATA codewords:",
            correctedData
        );


        return correctedData;
    }


    // =========================================================
    // BLOCK INFORMATION
    // =========================================================

    getBlockCount(
        symbolInfo
    ) {

        const direct =
            this.getInfoNumber(
                symbolInfo,
                [
                    "interleavedBlockCount",
                    "blockCount",
                    "rsBlockCount"
                ]
            );


        if (
            direct !== null
        ) {

            if (
                !Number.isInteger(
                    direct
                ) ||
                direct <= 0
            ) {

                throw new Error(
                    "Invalid Data Matrix Reed-Solomon block count."
                );
            }


            return direct;
        }


        return 1;
    }


    // =========================================================
    // DATA LENGTHS
    // =========================================================

    getDataLengths(
        symbolInfo,
        totalData,
        blockCount
    ) {

        const explicit =
            this.getInfoArray(
                symbolInfo,
                [
                    "dataCodewordsPerBlock",
                    "dataBlockSizes"
                ]
            );


        if (explicit) {

            this.validateBlockLengths(
                explicit,
                totalData,
                blockCount,
                "data"
            );


            return explicit;
        }


        const base =
            Math.floor(
                totalData /
                blockCount
            );


        const remainder =
            totalData %
            blockCount;


        const lengths =
            new Array(
                blockCount
            );


        for (
            let i = 0;
            i < blockCount;
            i++
        ) {

            lengths[i] =
                base +
                (
                    i < remainder
                        ? 1
                        : 0
                );
        }


        return lengths;
    }


    // =========================================================
    // ERROR LENGTHS
    // =========================================================

    getErrorLengths(
        symbolInfo,
        totalError,
        blockCount
    ) {

        const explicit =
            this.getInfoArray(
                symbolInfo,
                [
                    "errorCodewordsPerBlock",
                    "errorBlockSizes"
                ]
            );


        if (explicit) {

            this.validateBlockLengths(
                explicit,
                totalError,
                blockCount,
                "error-correction"
            );


            return explicit;
        }


        if (
            totalError %
            blockCount !== 0
        ) {

            throw new Error(
                "Data Matrix error codewords cannot be evenly distributed between RS blocks."
            );
        }


        const perBlock =
            totalError /
            blockCount;


        return new Array(
            blockCount
        ).fill(
            perBlock
        );
    }


    // =========================================================
    // BLOCK VALIDATION
    // =========================================================

    validateBlockLengths(
        lengths,
        expectedTotal,
        blockCount,
        description
    ) {

        if (
            lengths.length !==
            blockCount
        ) {

            throw new Error(
                `Data Matrix ${description} block count mismatch.`
            );
        }


        let total =
            0;


        for (
            let i = 0;
            i < lengths.length;
            i++
        ) {

            if (
                !Number.isInteger(
                    lengths[i]
                ) ||
                lengths[i] < 0
            ) {

                throw new Error(
                    `Invalid Data Matrix ${description} block size.`
                );
            }


            total +=
                lengths[i];
        }


        if (
            total !==
            expectedTotal
        ) {

            throw new Error(
                `Data Matrix ${description} block sizes total ${total}, expected ${expectedTotal}.`
            );
        }
    }


    // =========================================================
    // SYMBOL INFO NUMBER HELPER
    // =========================================================

    getInfoNumber(
        object,
        names
    ) {

        for (
            let i = 0;
            i < names.length;
            i++
        ) {

            const name =
                names[i];


            // Direct numeric property.

            if (
                typeof object[name] ===
                "number"
            ) {

                return object[name];
            }


            // Direct function.

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


            // Java-style getter.

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


    // =========================================================
    // SYMBOL INFO ARRAY HELPER
    // =========================================================

    getInfoArray(
        object,
        names
    ) {

        for (
            let i = 0;
            i < names.length;
            i++
        ) {

            const name =
                names[i];


            // Direct array property.

            if (
                Array.isArray(
                    object[name]
                ) ||
                object[name] instanceof
                    Int32Array ||
                object[name] instanceof
                    Uint8Array
            ) {

                return Array.from(
                    object[name]
                );
            }


            // Direct function.

            if (
                typeof object[name] ===
                "function"
            ) {

                const value =
                    object[name]();


                if (
                    Array.isArray(value) ||
                    value instanceof
                        Int32Array ||
                    value instanceof
                        Uint8Array
                ) {

                    return Array.from(
                        value
                    );
                }
            }


            // Java-style getter.

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
                    Array.isArray(value) ||
                    value instanceof
                        Int32Array ||
                    value instanceof
                        Uint8Array
                ) {

                    return Array.from(
                        value
                    );
                }
            }
        }


        return null;
    }
}