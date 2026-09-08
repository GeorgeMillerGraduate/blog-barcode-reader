/**
 * QRDataBlock
 *
 * Represents one QR Code Reed-Solomon block and provides
 * the logic required to de-interleave the raw codewords
 * read from the QR matrix.
 *
 * QR codewords are stored in the symbol in interleaved
 * order. Before Reed-Solomon correction they must be split
 * back into their individual blocks.
 *
 * Requires:
 *
 * - QRVersion.js
 *
 * Expected QRVersion API:
 *
 * version.getECBlocksForLevel(errorCorrectionLevel)
 *
 * The returned ECBlocks object should expose:
 *
 * - ecCodewordsPerBlock
 * - ecBlocks
 *
 * Each ECB entry should expose:
 *
 * - count
 * - dataCodewords
 */
class QRDataBlock {

    /**
     * Creates one QR data block.
     *
     * @param {number} numDataCodewords
     * @param {number|Array<number>|Uint8Array} codewords
     */
    constructor(
        numDataCodewords,
        codewords
    ) {

        if (
            !Number.isInteger(
                numDataCodewords
            ) ||
            numDataCodewords < 0
        ) {
            throw new RangeError(
                "numDataCodewords must be a non-negative integer."
            );
        }


        /*
         * Allow either:
         *
         * new QRDataBlock(10, 26)
         *
         * or:
         *
         * new QRDataBlock(10, Uint8Array(...))
         */
        if (
            Number.isInteger(
                codewords
            )
        ) {

            if (
                codewords <
                numDataCodewords
            ) {
                throw new RangeError(
                    "Block size cannot be smaller than its data codeword count."
                );
            }


            this.codewords =
                new Uint8Array(
                    codewords
                );

        } else if (
            codewords &&
            typeof codewords.length ===
                "number"
        ) {

            if (
                codewords.length <
                numDataCodewords
            ) {
                throw new RangeError(
                    "Codeword array is smaller than its data codeword count."
                );
            }


            this.codewords =
                codewords instanceof Uint8Array
                    ? codewords
                    : Uint8Array.from(
                        codewords
                    );

        } else {

            throw new TypeError(
                "QRDataBlock requires a codeword count or codeword array."
            );
        }


        this.numDataCodewords =
            numDataCodewords;
    }


    /**
     * Returns the number of payload/data codewords in
     * this block.
     *
     * @returns {number}
     */
    getNumDataCodewords() {

        return this.numDataCodewords;
    }


    /**
     * Returns this block's complete codeword array.
     *
     * This includes:
     *
     * data codewords + error correction codewords
     *
     * The actual array is returned intentionally because
     * Reed-Solomon correction modifies it in place.
     *
     * @returns {Uint8Array}
     */
    getCodewords() {

        return this.codewords;
    }


    /**
     * Returns the total number of codewords in this block.
     *
     * @returns {number}
     */
    getTotalCodewords() {

        return this.codewords.length;
    }


    /**
     * Returns the number of error-correction codewords.
     *
     * @returns {number}
     */
    getNumErrorCorrectionCodewords() {

        return (
            this.codewords.length -
            this.numDataCodewords
        );
    }


    /**
     * Returns only the data portion of the block.
     *
     * @returns {Uint8Array}
     */
    getDataCodewords() {

        return this.codewords.slice(
            0,
            this.numDataCodewords
        );
    }


    /**
     * Returns only the error-correction portion.
     *
     * @returns {Uint8Array}
     */
    getErrorCorrectionCodewords() {

        return this.codewords.slice(
            this.numDataCodewords
        );
    }


    /**
     * Splits raw interleaved QR codewords into individual
     * Reed-Solomon blocks.
     *
     * This follows the QR Code interleaving procedure used
     * by ZXing:
     *
     * 1. Construct every block.
     * 2. Fill common data columns.
     * 3. Fill the extra data byte in longer blocks.
     * 4. Fill interleaved error-correction bytes.
     *
     * @param {Array<number>|Uint8Array|Int32Array} rawCodewords
     * @param {*} version
     * @param {*} errorCorrectionLevel
     *
     * @returns {QRDataBlock[]}
     */
    static getDataBlocks(
        rawCodewords,
        version,
        errorCorrectionLevel
    ) {

        if (
            !rawCodewords ||
            typeof rawCodewords.length !==
                "number"
        ) {
            throw new TypeError(
                "QRDataBlock.getDataBlocks requires raw codewords."
            );
        }


        if (!version) {
            throw new TypeError(
                "QRDataBlock.getDataBlocks requires a QR version."
            );
        }


        /*
         * Validate against the version's expected total
         * codeword count.
         */
        const expectedTotal =
            QRDataBlock.getVersionTotalCodewords(
                version
            );


        if (
            rawCodewords.length !==
            expectedTotal
        ) {
            throw new Error(
                "Raw QR codeword count does not match the QR version. " +
                `Expected ${expectedTotal}, received ${rawCodewords.length}.`
            );
        }


        /*
         * Obtain the error-correction block definition for
         * the selected QR error-correction level.
         */
        const ecBlocks =
            QRDataBlock.getECBlocksForLevel(
                version,
                errorCorrectionLevel
            );


        const ecCodewordsPerBlock =
            QRDataBlock
                .getECCodewordsPerBlock(
                    ecBlocks
                );


        const ecBlockEntries =
            QRDataBlock.getECBEntries(
                ecBlocks
            );


        /*
         * -------------------------------------------------
         * STEP 1
         *
         * Determine the total number of physical blocks.
         * -------------------------------------------------
         */

        let totalBlocks = 0;


        for (
            let i = 0;
            i < ecBlockEntries.length;
            i++
        ) {

            totalBlocks +=
                QRDataBlock.getECBCount(
                    ecBlockEntries[i]
                );
        }


        if (totalBlocks <= 0) {
            throw new Error(
                "QR version defines no data blocks."
            );
        }


        /*
         * -------------------------------------------------
         * STEP 2
         *
         * Construct each block.
         * -------------------------------------------------
         */

        const result =
            new Array(
                totalBlocks
            );


        let blockIndex = 0;


        for (
            let i = 0;
            i < ecBlockEntries.length;
            i++
        ) {

            const ecBlock =
                ecBlockEntries[i];


            const count =
                QRDataBlock.getECBCount(
                    ecBlock
                );


            const dataCodewords =
                QRDataBlock
                    .getECBDataCodewords(
                        ecBlock
                    );


            const totalCodewords =
                dataCodewords +
                ecCodewordsPerBlock;


            for (
                let j = 0;
                j < count;
                j++
            ) {

                result[
                    blockIndex++
                ] =
                    new QRDataBlock(
                        dataCodewords,
                        totalCodewords
                    );
            }
        }


        /*
         * QR blocks differ in length by at most one byte.
         *
         * The longer blocks occur at the end of the block
         * array according to the QR specification.
         */
        const shorterBlocksTotalCodewords =
            result[0]
                .codewords
                .length;


        let longerBlocksStartAt =
            result.length - 1;


        while (
            longerBlocksStartAt >= 0
        ) {

            const currentLength =
                result[
                    longerBlocksStartAt
                ]
                .codewords
                .length;


            if (
                currentLength ===
                shorterBlocksTotalCodewords
            ) {
                break;
            }


            longerBlocksStartAt--;
        }


        longerBlocksStartAt++;


        /*
         * Number of data bytes shared by every block.
         *
         * Example:
         *
         * short block:
         *
         * 15 data + 18 EC = 33
         *
         * long block:
         *
         * 16 data + 18 EC = 34
         *
         * shorterBlocksNumDataCodewords = 15
         */
        const shorterBlocksNumDataCodewords =
            shorterBlocksTotalCodewords -
            ecCodewordsPerBlock;


        let rawCodewordsOffset = 0;


        /*
         * -------------------------------------------------
         * STEP 3
         *
         * Fill all data-codeword columns that every block
         * has in common.
         * -------------------------------------------------
         */

        for (
            let dataIndex = 0;
            dataIndex <
                shorterBlocksNumDataCodewords;
            dataIndex++
        ) {

            for (
                let block = 0;
                block < result.length;
                block++
            ) {

                QRDataBlock
                    .ensureRawCodewordAvailable(
                        rawCodewords,
                        rawCodewordsOffset
                    );


                result[
                    block
                ].codewords[
                    dataIndex
                ] =
                    rawCodewords[
                        rawCodewordsOffset++
                    ] &
                    0xFF;
            }
        }


        /*
         * -------------------------------------------------
         * STEP 4
         *
         * Longer blocks contain one additional data byte.
         *
         * Fill that byte now.
         * -------------------------------------------------
         */

        for (
            let block =
                longerBlocksStartAt;
            block < result.length;
            block++
        ) {

            QRDataBlock
                .ensureRawCodewordAvailable(
                    rawCodewords,
                    rawCodewordsOffset
                );


            result[
                block
            ].codewords[
                shorterBlocksNumDataCodewords
            ] =
                rawCodewords[
                    rawCodewordsOffset++
                ] &
                0xFF;
        }


        /*
         * -------------------------------------------------
         * STEP 5
         *
         * Fill the error-correction codewords.
         *
         * Raw EC bytes are interleaved across blocks.
         *
         * For longer blocks, EC data begins one array index
         * later because of the extra data byte.
         * -------------------------------------------------
         */

        const maxCodewordLength =
            result[
                result.length - 1
            ].codewords.length;


        for (
            let codewordIndex =
                shorterBlocksNumDataCodewords;
            codewordIndex <
                maxCodewordLength;
            codewordIndex++
        ) {

            for (
                let block = 0;
                block < result.length;
                block++
            ) {

                /*
                 * Longer blocks have one extra data byte.
                 *
                 * Therefore the corresponding EC byte goes
                 * one position further into their arrays.
                 */
                const destinationIndex =
                    block <
                        longerBlocksStartAt
                        ? codewordIndex
                        : codewordIndex + 1;


                /*
                 * A short block may already have reached its
                 * end during the final iteration.
                 */
                if (
                    destinationIndex >=
                    result[
                        block
                    ].codewords.length
                ) {
                    continue;
                }


                QRDataBlock
                    .ensureRawCodewordAvailable(
                        rawCodewords,
                        rawCodewordsOffset
                    );


                result[
                    block
                ].codewords[
                    destinationIndex
                ] =
                    rawCodewords[
                        rawCodewordsOffset++
                    ] &
                    0xFF;
            }
        }


        /*
         * Every raw codeword must have been consumed.
         */
        if (
            rawCodewordsOffset !==
            rawCodewords.length
        ) {
            throw new Error(
                "QR data block de-interleaving did not consume every codeword. " +
                `Consumed ${rawCodewordsOffset} of ${rawCodewords.length}.`
            );
        }


        return result;
    }


    /**
     * Alias for getDataBlocks().
     *
     * QRCodeReader supports either API.
     *
     * @param {*} rawCodewords
     * @param {*} version
     * @param {*} errorCorrectionLevel
     *
     * @returns {QRDataBlock[]}
     */
    static split(
        rawCodewords,
        version,
        errorCorrectionLevel
    ) {

        return QRDataBlock
            .getDataBlocks(
                rawCodewords,
                version,
                errorCorrectionLevel
            );
    }


    /**
     * Gets the ECBlocks definition for an error correction
     * level from QRVersion.
     *
     * @param {*} version
     * @param {*} errorCorrectionLevel
     *
     * @returns {*}
     */
    static getECBlocksForLevel(
        version,
        errorCorrectionLevel
    ) {

        /*
         * Preferred ZXing-style API.
         */
        if (
            typeof version
                .getECBlocksForLevel ===
            "function"
        ) {

            const result =
                version
                    .getECBlocksForLevel(
                        errorCorrectionLevel
                    );


            if (result) {
                return result;
            }
        }


        /*
         * Alternative method name.
         */
        if (
            typeof version
                .getECBlocks ===
            "function"
        ) {

            const result =
                version.getECBlocks(
                    errorCorrectionLevel
                );


            if (result) {
                return result;
            }
        }


        /*
         * Object/map fallback.
         */
        if (version.ecBlocks) {

            const keys =
                QRDataBlock
                    .getErrorCorrectionLevelKeys(
                        errorCorrectionLevel
                    );


            for (
                let i = 0;
                i < keys.length;
                i++
            ) {

                const key =
                    keys[i];


                if (
                    version.ecBlocks[
                        key
                    ] !== undefined
                ) {

                    return version
                        .ecBlocks[
                            key
                        ];
                }
            }
        }


        throw new Error(
            "QRVersion does not provide error-correction block information."
        );
    }


    /**
     * Extracts the number of EC codewords contained in
     * every block.
     *
     * @param {*} ecBlocks
     * @returns {number}
     */
    static getECCodewordsPerBlock(
        ecBlocks
    ) {

        let value;


        if (
            typeof ecBlocks
                .getECCodewordsPerBlock ===
            "function"
        ) {

            value =
                ecBlocks
                    .getECCodewordsPerBlock();

        } else if (
            Number.isInteger(
                ecBlocks
                    .ecCodewordsPerBlock
            )
        ) {

            value =
                ecBlocks
                    .ecCodewordsPerBlock;

        } else if (
            Number.isInteger(
                ecBlocks
                    .errorCorrectionCodewordsPerBlock
            )
        ) {

            value =
                ecBlocks
                    .errorCorrectionCodewordsPerBlock;

        } else if (
            Number.isInteger(
                ecBlocks.ecCodewords
            )
        ) {

            value =
                ecBlocks.ecCodewords;
        }


        if (
            !Number.isInteger(value) ||
            value <= 0
        ) {
            throw new Error(
                "Invalid QR EC codeword count."
            );
        }


        return value;
    }


    /**
     * Returns the ECB group definitions.
     *
     * @param {*} ecBlocks
     * @returns {Array}
     */
    static getECBEntries(
        ecBlocks
    ) {

        let entries;


        if (
            typeof ecBlocks
                .getECBlocks ===
            "function"
        ) {

            entries =
                ecBlocks.getECBlocks();

        } else if (
            Array.isArray(
                ecBlocks.ecBlocks
            )
        ) {

            entries =
                ecBlocks.ecBlocks;

        } else if (
            Array.isArray(
                ecBlocks.blocks
            )
        ) {

            entries =
                ecBlocks.blocks;

        } else if (
            Array.isArray(
                ecBlocks.ecBlockArray
            )
        ) {

            entries =
                ecBlocks.ecBlockArray;
        }


        if (
            !entries ||
            entries.length === 0
        ) {
            throw new Error(
                "QR ECBlocks contains no block definitions."
            );
        }


        return entries;
    }


    /**
     * Returns the number of blocks represented by one ECB
     * group.
     *
     * @param {*} ecBlock
     * @returns {number}
     */
    static getECBCount(
        ecBlock
    ) {

        let count;


        if (
            typeof ecBlock
                .getCount ===
            "function"
        ) {

            count =
                ecBlock.getCount();

        } else if (
            Number.isInteger(
                ecBlock.count
            )
        ) {

            count =
                ecBlock.count;

        } else if (
            Number.isInteger(
                ecBlock.numberOfBlocks
            )
        ) {

            count =
                ecBlock.numberOfBlocks;
        }


        if (
            !Number.isInteger(count) ||
            count <= 0
        ) {
            throw new Error(
                "Invalid QR EC block count."
            );
        }


        return count;
    }


    /**
     * Returns the number of data codewords in each block
     * represented by an ECB group.
     *
     * @param {*} ecBlock
     * @returns {number}
     */
    static getECBDataCodewords(
        ecBlock
    ) {

        let count;


        if (
            typeof ecBlock
                .getDataCodewords ===
            "function"
        ) {

            count =
                ecBlock
                    .getDataCodewords();

        } else if (
            Number.isInteger(
                ecBlock.dataCodewords
            )
        ) {

            count =
                ecBlock.dataCodewords;

        } else if (
            Number.isInteger(
                ecBlock.numDataCodewords
            )
        ) {

            count =
                ecBlock.numDataCodewords;
        }


        if (
            !Number.isInteger(count) ||
            count <= 0
        ) {
            throw new Error(
                "Invalid QR data codeword count in EC block."
            );
        }


        return count;
    }


    /**
     * Returns the total codeword count for a QR version.
     *
     * @param {*} version
     * @returns {number}
     */
    static getVersionTotalCodewords(
        version
    ) {

        let total;


        if (
            typeof version
                .getTotalCodewords ===
            "function"
        ) {

            total =
                version
                    .getTotalCodewords();

        } else if (
            Number.isInteger(
                version.totalCodewords
            )
        ) {

            total =
                version.totalCodewords;
        }


        if (
            !Number.isInteger(total) ||
            total <= 0
        ) {
            throw new Error(
                "QRVersion does not expose a valid total codeword count."
            );
        }


        return total;
    }


    /**
     * Produces possible map keys for an error correction
     * level.
     *
     * This allows QRVersion to store EC block definitions
     * using names such as:
     *
     * L
     * M
     * Q
     * H
     *
     * @param {*} level
     * @returns {Array}
     */
    static getErrorCorrectionLevelKeys(
        level
    ) {

        const keys = [];


        if (
            level === null ||
            level === undefined
        ) {
            return keys;
        }


        if (
            typeof level ===
            "string"
        ) {

            keys.push(level);

            keys.push(
                level.toUpperCase()
            );

            keys.push(
                level.toLowerCase()
            );

            return [
                ...new Set(keys)
            ];
        }


        if (
            typeof level.getName ===
            "function"
        ) {

            const name =
                String(
                    level.getName()
                );


            keys.push(name);
            keys.push(
                name.toUpperCase()
            );
            keys.push(
                name.toLowerCase()
            );
        }


        if (
            typeof level.name ===
            "string"
        ) {

            keys.push(
                level.name
            );

            keys.push(
                level.name
                    .toUpperCase()
            );

            keys.push(
                level.name
                    .toLowerCase()
            );
        }


        if (
            Number.isInteger(
                level.bits
            )
        ) {

            keys.push(
                level.bits
            );

            keys.push(
                String(
                    level.bits
                )
            );
        }


        if (
            typeof level.toString ===
            "function"
        ) {

            const text =
                level.toString();


            if (
                text &&
                text !==
                    "[object Object]"
            ) {

                keys.push(text);

                keys.push(
                    text.toUpperCase()
                );

                keys.push(
                    text.toLowerCase()
                );
            }
        }


        return [
            ...new Set(keys)
        ];
    }


    /**
     * Ensures a raw codeword is available before reading it.
     *
     * @param {*} rawCodewords
     * @param {number} offset
     */
    static ensureRawCodewordAvailable(
        rawCodewords,
        offset
    ) {

        if (
            offset >=
            rawCodewords.length
        ) {
            throw new Error(
                "Unexpected end of QR raw codeword stream."
            );
        }
    }


    /**
     * Returns a copy of this block.
     *
     * @returns {QRDataBlock}
     */
    clone() {

        return new QRDataBlock(
            this.numDataCodewords,
            new Uint8Array(
                this.codewords
            )
        );
    }


    /**
     * Returns a useful debug representation.
     *
     * @returns {string}
     */
    toString() {

        return (
            "QRDataBlock(" +
            `data=${this.numDataCodewords}, ` +
            `ec=${this.getNumErrorCorrectionCodewords()}, ` +
            `total=${this.codewords.length}` +
            ")"
        );
    }
}