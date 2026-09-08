/**
 * QRVersion
 *
 * Stores structural information for QR Code versions 1-40.
 *
 * Responsibilities:
 *
 * - Version number
 * - Symbol dimension
 * - Alignment-pattern centres
 * - Total codeword count
 * - Error-correction block structure for L/M/Q/H
 * - Version-information BCH decoding for versions 7-40
 * - Building the QR function-pattern mask
 *
 * Compatible with:
 *
 * - QRBitMatrixParser.js
 * - QRDataBlock.js
 * - QRCodeReader.js
 *
 * Requires:
 *
 * - BitMatrix.js
 */
class QRVersion {

    /**
     * @param {number} versionNumber
     * @param {number[]} alignmentPatternCenters
     * @param {Object} ecBlocks
     */
    constructor(
        versionNumber,
        alignmentPatternCenters = null,
        ecBlocks = null
    ) {

        if (
            !Number.isInteger(versionNumber) ||
            versionNumber < 1 ||
            versionNumber > 40
        ) {
            throw new RangeError(
                `QR version must be between 1 and 40: ${versionNumber}`
            );
        }


        /*
         * Permit:
         *
         * new QRVersion(5)
         *
         * as well as construction from the internal table.
         */
        if (
            alignmentPatternCenters === null ||
            ecBlocks === null
        ) {

            const definition =
                QRVersion
                    .VERSION_DEFINITIONS[
                        versionNumber - 1
                    ];


            if (!definition) {
                throw new Error(
                    `QR version ${versionNumber} is not defined.`
                );
            }


            alignmentPatternCenters =
                definition.alignmentPatternCenters;


            ecBlocks =
                definition.ecBlocks;
        }


        this.versionNumber =
            versionNumber;


        /*
         * Alias supported by QRBitMatrixParser.
         */
        this.version =
            versionNumber;


        this.alignmentPatternCenters =
            Array.from(
                alignmentPatternCenters
            );


        this.ecBlocks =
            ecBlocks;


        this.dimension =
            17 +
            4 *
            versionNumber;


        this.totalCodewords =
            this.calculateTotalCodewords();
    }


    /**
     * Returns the version number.
     *
     * @returns {number}
     */
    getVersionNumber() {

        return this.versionNumber;
    }


    /**
     * Returns symbol width/height in modules.
     *
     * Version 1  = 21
     * Version 2  = 25
     * ...
     * Version 40 = 177
     *
     * @returns {number}
     */
    getDimensionForVersion() {

        return this.dimension;
    }


    /**
     * Returns the alignment-pattern centre coordinates.
     *
     * Version 1 has none.
     *
     * @returns {number[]}
     */
    getAlignmentPatternCenters() {

        return Array.from(
            this.alignmentPatternCenters
        );
    }


    /**
     * Returns total QR codewords.
     *
     * This includes both payload and error-correction
     * codewords.
     *
     * @returns {number}
     */
    getTotalCodewords() {

        return this.totalCodewords;
    }


    /**
     * Returns the error-correction block structure for
     * L, M, Q or H.
     *
     * @param {*} errorCorrectionLevel
     *
     * @returns {Object}
     */
    getECBlocksForLevel(
        errorCorrectionLevel
    ) {

        const level =
            QRVersion
                .normaliseErrorCorrectionLevel(
                    errorCorrectionLevel
                );


        const blocks =
            this.ecBlocks[
                level
            ];


        if (!blocks) {
            throw new Error(
                `QR version ${this.versionNumber} has no EC definition for level ${level}.`
            );
        }


        return blocks;
    }


    /**
     * Alias.
     *
     * @param {*} errorCorrectionLevel
     *
     * @returns {Object}
     */
    getECBlocks(
        errorCorrectionLevel
    ) {

        return this
            .getECBlocksForLevel(
                errorCorrectionLevel
            );
    }


    /**
     * Calculates the total codeword count from the EC
     * structure.
     *
     * All four EC levels must describe the same total
     * symbol codeword count. L is sufficient for deriving
     * it.
     *
     * @returns {number}
     */
    calculateTotalCodewords() {

        const ecBlocks =
            this.ecBlocks.L;


        if (!ecBlocks) {
            throw new Error(
                `QR version ${this.versionNumber} has no L error-correction definition.`
            );
        }


        let total = 0;


        for (
            let i = 0;
            i < ecBlocks.ecBlocks.length;
            i++
        ) {

            const block =
                ecBlocks.ecBlocks[i];


            total +=
                block.count *
                (
                    block.dataCodewords +
                    ecBlocks.ecCodewordsPerBlock
                );
        }


        return total;
    }


    /**
     * Builds a BitMatrix marking every QR function module.
     *
     * true  = function/reserved module
     * false = data module
     *
     * QRBitMatrixParser uses this matrix while reading
     * codewords so finder patterns, timing patterns,
     * alignment patterns, format information and version
     * information are skipped.
     *
     * @returns {BitMatrix}
     */
    buildFunctionPattern() {

        if (
            typeof BitMatrix ===
            "undefined"
        ) {
            throw new Error(
                "BitMatrix.js must be loaded before QRVersion.buildFunctionPattern()."
            );
        }


        const dimension =
            this.dimension;


        const matrix =
            new BitMatrix(
                dimension,
                dimension
            );


        /*
         * -------------------------------------------------
         * FINDER PATTERNS + SEPARATORS + FORMAT AREAS
         * -------------------------------------------------
         *
         * Top-left occupies a 9×9 reserved region.
         *
         * Top-right occupies 8×9.
         *
         * Bottom-left occupies 9×8.
         */
        matrix.setRegion(
            0,
            0,
            9,
            9
        );


        matrix.setRegion(
            dimension - 8,
            0,
            8,
            9
        );


        matrix.setRegion(
            0,
            dimension - 8,
            9,
            8
        );


        /*
         * -------------------------------------------------
         * ALIGNMENT PATTERNS
         * -------------------------------------------------
         */
        const centers =
            this.alignmentPatternCenters;


        for (
            let yIndex = 0;
            yIndex < centers.length;
            yIndex++
        ) {

            const centerY =
                centers[yIndex];


            for (
                let xIndex = 0;
                xIndex < centers.length;
                xIndex++
            ) {

                const centerX =
                    centers[xIndex];


                /*
                 * Skip the three positions where alignment
                 * patterns would overlap finder patterns.
                 */
                const overlapsTopLeft =
                    xIndex === 0 &&
                    yIndex === 0;


                const overlapsTopRight =
                    xIndex ===
                        centers.length - 1 &&
                    yIndex === 0;


                const overlapsBottomLeft =
                    xIndex === 0 &&
                    yIndex ===
                        centers.length - 1;


                if (
                    overlapsTopLeft ||
                    overlapsTopRight ||
                    overlapsBottomLeft
                ) {
                    continue;
                }


                matrix.setRegion(
                    centerX - 2,
                    centerY - 2,
                    5,
                    5
                );
            }
        }


        /*
         * -------------------------------------------------
         * TIMING PATTERNS
         * -------------------------------------------------
         *
         * Row 6 and column 6 between finder-pattern areas.
         */
        matrix.setRegion(
            6,
            9,
            1,
            dimension - 17
        );


        matrix.setRegion(
            9,
            6,
            dimension - 17,
            1
        );


        /*
         * -------------------------------------------------
         * VERSION INFORMATION
         * -------------------------------------------------
         *
         * Versions 7-40 contain two 3×6 copies.
         */
        if (
            this.versionNumber > 6
        ) {

            matrix.setRegion(
                dimension - 11,
                0,
                3,
                6
            );


            matrix.setRegion(
                0,
                dimension - 11,
                6,
                3
            );
        }


        return matrix;
    }


    /**
     * Returns a cached QRVersion object.
     *
     * @param {number} versionNumber
     *
     * @returns {QRVersion}
     */
    static getVersionForNumber(
        versionNumber
    ) {

        if (
            !Number.isInteger(versionNumber) ||
            versionNumber < 1 ||
            versionNumber > 40
        ) {
            throw new RangeError(
                `QR version must be between 1 and 40: ${versionNumber}`
            );
        }


        if (
            !QRVersion
                .VERSIONS[
                    versionNumber - 1
                ]
        ) {

            const definition =
                QRVersion
                    .VERSION_DEFINITIONS[
                        versionNumber - 1
                    ];


            QRVersion
                .VERSIONS[
                    versionNumber - 1
                ] =
                    new QRVersion(
                        versionNumber,
                        definition
                            .alignmentPatternCenters,
                        definition
                            .ecBlocks
                    );
        }


        return QRVersion
            .VERSIONS[
                versionNumber - 1
            ];
    }


    /**
     * Alias used by QRBitMatrixParser.
     *
     * @param {number} versionNumber
     *
     * @returns {QRVersion}
     */
    static getVersion(
        versionNumber
    ) {

        return QRVersion
            .getVersionForNumber(
                versionNumber
            );
    }


    /**
     * Derives a version directly from a QR matrix dimension.
     *
     * @param {number} dimension
     *
     * @returns {QRVersion}
     */
    static getProvisionalVersionForDimension(
        dimension
    ) {

        if (
            !Number.isInteger(dimension) ||
            dimension < 21 ||
            dimension > 177 ||
            (
                dimension &
                0x03
            ) !== 1
        ) {
            throw new Error(
                `Invalid QR dimension: ${dimension}`
            );
        }


        const versionNumber =
            (
                dimension -
                17
            ) /
            4;


        return QRVersion
            .getVersionForNumber(
                versionNumber
            );
    }


    /**
     * Decodes the 18-bit BCH-protected version information
     * found in QR versions 7-40.
     *
     * Up to three damaged bits can be recovered.
     *
     * @param {number} versionBits
     *
     * @returns {QRVersion|null}
     */
    static decodeVersionInformation(
        versionBits
    ) {

        if (
            !Number.isInteger(
                versionBits
            ) ||
            versionBits < 0 ||
            versionBits > 0x3FFFF
        ) {
            throw new RangeError(
                `QR version information must be an 18-bit value: ${versionBits}`
            );
        }


        let bestDifference =
            Number.POSITIVE_INFINITY;


        let bestVersion = 0;


        for (
            let i = 0;
            i <
                QRVersion
                    .VERSION_DECODE_INFO
                    .length;
            i++
        ) {

            const targetVersion =
                QRVersion
                    .VERSION_DECODE_INFO[i];


            /*
             * Version information starts at version 7.
             */
            const versionNumber =
                i + 7;


            if (
                targetVersion ===
                versionBits
            ) {

                return QRVersion
                    .getVersionForNumber(
                        versionNumber
                    );
            }


            const difference =
                QRVersion
                    .numBitsDiffering(
                        versionBits,
                        targetVersion
                    );


            if (
                difference <
                bestDifference
            ) {

                bestDifference =
                    difference;


                bestVersion =
                    versionNumber;
            }
        }


        /*
         * BCH(18,6) can correct up to three bit errors.
         */
        if (
            bestDifference <= 3
        ) {

            return QRVersion
                .getVersionForNumber(
                    bestVersion
                );
        }


        return null;
    }


    /**
     * Alias.
     *
     * @param {number} versionBits
     *
     * @returns {QRVersion|null}
     */
    static decode(
        versionBits
    ) {

        return QRVersion
            .decodeVersionInformation(
                versionBits
            );
    }


    /**
     * Counts differing bits between two integers.
     *
     * @param {number} a
     * @param {number} b
     *
     * @returns {number}
     */
    static numBitsDiffering(
        a,
        b
    ) {

        let value =
            (
                a ^
                b
            ) >>>
            0;


        let count = 0;


        while (value !== 0) {

            value =
                (
                    value &
                    (
                        value - 1
                    )
                ) >>>
                0;


            count++;
        }


        return count;
    }


    /**
     * Converts various EC-level representations to one of:
     *
     * L M Q H
     *
     * @param {*} level
     *
     * @returns {string}
     */
    static normaliseErrorCorrectionLevel(
        level
    ) {

        if (
            typeof level ===
            "string"
        ) {

            const value =
                level
                    .trim()
                    .toUpperCase();


            if (
                value === "L" ||
                value === "M" ||
                value === "Q" ||
                value === "H"
            ) {
                return value;
            }
        }


        if (
            level &&
            typeof level
                .getName ===
                "function"
        ) {

            return QRVersion
                .normaliseErrorCorrectionLevel(
                    level.getName()
                );
        }


        if (
            level &&
            typeof level.name ===
                "string"
        ) {

            return QRVersion
                .normaliseErrorCorrectionLevel(
                    level.name
                );
        }


        throw new Error(
            `Unknown QR error correction level: ${level}`
        );
    }


    /**
     * Creates one ECB group.
     *
     * @param {number} count
     * @param {number} dataCodewords
     *
     * @returns {Object}
     */
    static ecb(
        count,
        dataCodewords
    ) {

        return {

            count:
                count,

            dataCodewords:
                dataCodewords,

            getCount() {
                return this.count;
            },

            getDataCodewords() {
                return this.dataCodewords;
            }
        };
    }


    /**
     * Creates an ECBlocks object.
     *
     * @param {number} ecCodewordsPerBlock
     * @param {...Object} blocks
     *
     * @returns {Object}
     */
    static ecBlocks(
        ecCodewordsPerBlock,
        ...blocks
    ) {

        return {

            ecCodewordsPerBlock:
                ecCodewordsPerBlock,

            ecBlocks:
                blocks,

            getECCodewordsPerBlock() {
                return this.ecCodewordsPerBlock;
            },

            getECBlocks() {
                return this.ecBlocks;
            },

            getNumBlocks() {

                let total = 0;

                for (
                    let i = 0;
                    i < this.ecBlocks.length;
                    i++
                ) {

                    total +=
                        this.ecBlocks[i]
                            .count;
                }

                return total;
            },

            getTotalECCodewords() {

                return (
                    this
                        .getNumBlocks() *
                    this
                        .ecCodewordsPerBlock
                );
            }
        };
    }


    /**
     * Debug representation.
     *
     * @returns {string}
     */
    toString() {

        return (
            "QRVersion(" +
            `version=${this.versionNumber}, ` +
            `dimension=${this.dimension}, ` +
            `totalCodewords=${this.totalCodewords}` +
            ")"
        );
    }
}


/*
 * =========================================================
 * QR VERSION INFORMATION BCH TABLE
 * =========================================================
 *
 * Versions 7-40.
 */
QRVersion.VERSION_DECODE_INFO = [

    0x07C94,
    0x085BC,
    0x09A99,
    0x0A4D3,
    0x0BBF6,
    0x0C762,
    0x0D847,
    0x0E60D,
    0x0F928,
    0x10B78,
    0x1145D,
    0x12A17,
    0x13532,
    0x149A6,
    0x15683,
    0x168C9,
    0x177EC,
    0x18EC4,
    0x191E1,
    0x1AFAB,
    0x1B08E,
    0x1CC1A,
    0x1D33F,
    0x1ED75,
    0x1F250,
    0x209D5,
    0x216F0,
    0x228BA,
    0x2379F,
    0x24B0B,
    0x2542E,
    0x26A64,
    0x27541,
    0x28C69
];


/*
 * Cached QRVersion objects.
 */
QRVersion.VERSIONS =
    new Array(40);


/*
 * =========================================================
 * COMPLETE QR VERSION TABLE
 * =========================================================
 *
 * Each entry contains:
 *
 * - exact alignment-pattern centres
 * - EC structure for L
 * - EC structure for M
 * - EC structure for Q
 * - EC structure for H
 *
 * ECB(count, dataCodewords)
 * ECBlocks(ecCodewordsPerBlock, ECB...)
 */
QRVersion.VERSION_DEFINITIONS = [

    /*
     * VERSION 1
     */
    {
        alignmentPatternCenters: [],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                7,
                QRVersion.ecb(1, 19)
            ),

            M: QRVersion.ecBlocks(
                10,
                QRVersion.ecb(1, 16)
            ),

            Q: QRVersion.ecBlocks(
                13,
                QRVersion.ecb(1, 13)
            ),

            H: QRVersion.ecBlocks(
                17,
                QRVersion.ecb(1, 9)
            )
        }
    },


    /*
     * VERSION 2
     */
    {
        alignmentPatternCenters:
            [6, 18],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                10,
                QRVersion.ecb(1, 34)
            ),

            M: QRVersion.ecBlocks(
                16,
                QRVersion.ecb(1, 28)
            ),

            Q: QRVersion.ecBlocks(
                22,
                QRVersion.ecb(1, 22)
            ),

            H: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(1, 16)
            )
        }
    },


    /*
     * VERSION 3
     */
    {
        alignmentPatternCenters:
            [6, 22],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                15,
                QRVersion.ecb(1, 55)
            ),

            M: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(1, 44)
            ),

            Q: QRVersion.ecBlocks(
                18,
                QRVersion.ecb(2, 17)
            ),

            H: QRVersion.ecBlocks(
                22,
                QRVersion.ecb(2, 13)
            )
        }
    },


    /*
     * VERSION 4
     */
    {
        alignmentPatternCenters:
            [6, 26],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                20,
                QRVersion.ecb(1, 80)
            ),

            M: QRVersion.ecBlocks(
                18,
                QRVersion.ecb(2, 32)
            ),

            Q: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(2, 24)
            ),

            H: QRVersion.ecBlocks(
                16,
                QRVersion.ecb(4, 9)
            )
        }
    },


    /*
     * VERSION 5
     */
    {
        alignmentPatternCenters:
            [6, 30],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(1, 108)
            ),

            M: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(2, 43)
            ),

            Q: QRVersion.ecBlocks(
                18,
                QRVersion.ecb(2, 15),
                QRVersion.ecb(2, 16)
            ),

            H: QRVersion.ecBlocks(
                22,
                QRVersion.ecb(2, 11),
                QRVersion.ecb(2, 12)
            )
        }
    },


    /*
     * VERSION 6
     */
    {
        alignmentPatternCenters:
            [6, 34],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                18,
                QRVersion.ecb(2, 68)
            ),

            M: QRVersion.ecBlocks(
                16,
                QRVersion.ecb(4, 27)
            ),

            Q: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(4, 19)
            ),

            H: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(4, 15)
            )
        }
    },


    /*
     * VERSION 7
     */
    {
        alignmentPatternCenters:
            [6, 22, 38],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                20,
                QRVersion.ecb(2, 78)
            ),

            M: QRVersion.ecBlocks(
                18,
                QRVersion.ecb(4, 31)
            ),

            Q: QRVersion.ecBlocks(
                18,
                QRVersion.ecb(2, 14),
                QRVersion.ecb(4, 15)
            ),

            H: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(4, 13),
                QRVersion.ecb(1, 14)
            )
        }
    },


    /*
     * VERSION 8
     */
    {
        alignmentPatternCenters:
            [6, 24, 42],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(2, 97)
            ),

            M: QRVersion.ecBlocks(
                22,
                QRVersion.ecb(2, 38),
                QRVersion.ecb(2, 39)
            ),

            Q: QRVersion.ecBlocks(
                22,
                QRVersion.ecb(4, 18),
                QRVersion.ecb(2, 19)
            ),

            H: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(4, 14),
                QRVersion.ecb(2, 15)
            )
        }
    },


    /*
     * VERSION 9
     */
    {
        alignmentPatternCenters:
            [6, 26, 46],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(2, 116)
            ),

            M: QRVersion.ecBlocks(
                22,
                QRVersion.ecb(3, 36),
                QRVersion.ecb(2, 37)
            ),

            Q: QRVersion.ecBlocks(
                20,
                QRVersion.ecb(4, 16),
                QRVersion.ecb(4, 17)
            ),

            H: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(4, 12),
                QRVersion.ecb(4, 13)
            )
        }
    },


    /*
     * VERSION 10
     */
    {
        alignmentPatternCenters:
            [6, 28, 50],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                18,
                QRVersion.ecb(2, 68),
                QRVersion.ecb(2, 69)
            ),

            M: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(4, 43),
                QRVersion.ecb(1, 44)
            ),

            Q: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(6, 19),
                QRVersion.ecb(2, 20)
            ),

            H: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(6, 15),
                QRVersion.ecb(2, 16)
            )
        }
    },


    /*
     * VERSION 11
     */
    {
        alignmentPatternCenters:
            [6, 30, 54],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                20,
                QRVersion.ecb(4, 81)
            ),

            M: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(1, 50),
                QRVersion.ecb(4, 51)
            ),

            Q: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(4, 22),
                QRVersion.ecb(4, 23)
            ),

            H: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(3, 12),
                QRVersion.ecb(8, 13)
            )
        }
    },


    /*
     * VERSION 12
     */
    {
        alignmentPatternCenters:
            [6, 32, 58],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(2, 92),
                QRVersion.ecb(2, 93)
            ),

            M: QRVersion.ecBlocks(
                22,
                QRVersion.ecb(6, 36),
                QRVersion.ecb(2, 37)
            ),

            Q: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(4, 20),
                QRVersion.ecb(6, 21)
            ),

            H: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(7, 14),
                QRVersion.ecb(4, 15)
            )
        }
    },


    /*
     * VERSION 13
     */
    {
        alignmentPatternCenters:
            [6, 34, 62],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(4, 107)
            ),

            M: QRVersion.ecBlocks(
                22,
                QRVersion.ecb(8, 37),
                QRVersion.ecb(1, 38)
            ),

            Q: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(8, 20),
                QRVersion.ecb(4, 21)
            ),

            H: QRVersion.ecBlocks(
                22,
                QRVersion.ecb(12, 11),
                QRVersion.ecb(4, 12)
            )
        }
    },


    /*
     * VERSION 14
     */
    {
        alignmentPatternCenters:
            [6, 26, 46, 66],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(3, 115),
                QRVersion.ecb(1, 116)
            ),

            M: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(4, 40),
                QRVersion.ecb(5, 41)
            ),

            Q: QRVersion.ecBlocks(
                20,
                QRVersion.ecb(11, 16),
                QRVersion.ecb(5, 17)
            ),

            H: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(11, 12),
                QRVersion.ecb(5, 13)
            )
        }
    },


    /*
     * VERSION 15
     */
    {
        alignmentPatternCenters:
            [6, 26, 48, 70],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                22,
                QRVersion.ecb(5, 87),
                QRVersion.ecb(1, 88)
            ),

            M: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(5, 41),
                QRVersion.ecb(5, 42)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(5, 24),
                QRVersion.ecb(7, 25)
            ),

            H: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(11, 12),
                QRVersion.ecb(7, 13)
            )
        }
    },


    /*
     * VERSION 16
     */
    {
        alignmentPatternCenters:
            [6, 26, 50, 74],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(5, 98),
                QRVersion.ecb(1, 99)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(7, 45),
                QRVersion.ecb(3, 46)
            ),

            Q: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(15, 19),
                QRVersion.ecb(2, 20)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(3, 15),
                QRVersion.ecb(13, 16)
            )
        }
    },


    /*
     * VERSION 17
     */
    {
        alignmentPatternCenters:
            [6, 30, 54, 78],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(1, 107),
                QRVersion.ecb(5, 108)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(10, 46),
                QRVersion.ecb(1, 47)
            ),

            Q: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(1, 22),
                QRVersion.ecb(15, 23)
            ),

            H: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(2, 14),
                QRVersion.ecb(17, 15)
            )
        }
    },


    /*
     * VERSION 18
     */
    {
        alignmentPatternCenters:
            [6, 30, 56, 82],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(5, 120),
                QRVersion.ecb(1, 121)
            ),

            M: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(9, 43),
                QRVersion.ecb(4, 44)
            ),

            Q: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(17, 22),
                QRVersion.ecb(1, 23)
            ),

            H: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(2, 14),
                QRVersion.ecb(19, 15)
            )
        }
    },


    /*
     * VERSION 19
     */
    {
        alignmentPatternCenters:
            [6, 30, 58, 86],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(3, 113),
                QRVersion.ecb(4, 114)
            ),

            M: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(3, 44),
                QRVersion.ecb(11, 45)
            ),

            Q: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(17, 21),
                QRVersion.ecb(4, 22)
            ),

            H: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(9, 13),
                QRVersion.ecb(16, 14)
            )
        }
    },


    /*
     * VERSION 20
     */
    {
        alignmentPatternCenters:
            [6, 34, 62, 90],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(3, 107),
                QRVersion.ecb(5, 108)
            ),

            M: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(3, 41),
                QRVersion.ecb(13, 42)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(15, 24),
                QRVersion.ecb(5, 25)
            ),

            H: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(15, 15),
                QRVersion.ecb(10, 16)
            )
        }
    },


    /*
     * VERSION 21
     */
    {
        alignmentPatternCenters:
            [6, 28, 50, 72, 94],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(4, 116),
                QRVersion.ecb(4, 117)
            ),

            M: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(17, 42)
            ),

            Q: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(17, 22),
                QRVersion.ecb(6, 23)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(19, 16),
                QRVersion.ecb(6, 17)
            )
        }
    },


    /*
     * VERSION 22
     */
    {
        alignmentPatternCenters:
            [6, 26, 50, 74, 98],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(2, 111),
                QRVersion.ecb(7, 112)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(17, 46)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(7, 24),
                QRVersion.ecb(16, 25)
            ),

            H: QRVersion.ecBlocks(
                24,
                QRVersion.ecb(34, 13)
            )
        }
    },


    /*
     * VERSION 23
     */
    {
        alignmentPatternCenters:
            [6, 30, 54, 78, 102],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(4, 121),
                QRVersion.ecb(5, 122)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(4, 47),
                QRVersion.ecb(14, 48)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(11, 24),
                QRVersion.ecb(14, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(16, 15),
                QRVersion.ecb(14, 16)
            )
        }
    },


    /*
     * VERSION 24
     */
    {
        alignmentPatternCenters:
            [6, 28, 54, 80, 106],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(6, 117),
                QRVersion.ecb(4, 118)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(6, 45),
                QRVersion.ecb(14, 46)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(11, 24),
                QRVersion.ecb(16, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(30, 16),
                QRVersion.ecb(2, 17)
            )
        }
    },


    /*
     * VERSION 25
     */
    {
        alignmentPatternCenters:
            [6, 32, 58, 84, 110],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                26,
                QRVersion.ecb(8, 106),
                QRVersion.ecb(4, 107)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(8, 47),
                QRVersion.ecb(13, 48)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(7, 24),
                QRVersion.ecb(22, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(22, 15),
                QRVersion.ecb(13, 16)
            )
        }
    },


    /*
     * VERSION 26
     */
    {
        alignmentPatternCenters:
            [6, 30, 58, 86, 114],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(10, 114),
                QRVersion.ecb(2, 115)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(19, 46),
                QRVersion.ecb(4, 47)
            ),

            Q: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(28, 22),
                QRVersion.ecb(6, 23)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(33, 16),
                QRVersion.ecb(4, 17)
            )
        }
    },


    /*
     * VERSION 27
     */
    {
        alignmentPatternCenters:
            [6, 34, 62, 90, 118],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(8, 122),
                QRVersion.ecb(4, 123)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(22, 45),
                QRVersion.ecb(3, 46)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(8, 23),
                QRVersion.ecb(26, 24)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(12, 15),
                QRVersion.ecb(28, 16)
            )
        }
    },


    /*
     * VERSION 28
     */
    {
        alignmentPatternCenters:
            [6, 26, 50, 74, 98, 122],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(3, 117),
                QRVersion.ecb(10, 118)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(3, 45),
                QRVersion.ecb(23, 46)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(4, 24),
                QRVersion.ecb(31, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(11, 15),
                QRVersion.ecb(31, 16)
            )
        }
    },


    /*
     * VERSION 29
     */
    {
        alignmentPatternCenters:
            [6, 30, 54, 78, 102, 126],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(7, 116),
                QRVersion.ecb(7, 117)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(21, 45),
                QRVersion.ecb(7, 46)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(1, 23),
                QRVersion.ecb(37, 24)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(19, 15),
                QRVersion.ecb(26, 16)
            )
        }
    },


    /*
     * VERSION 30
     */
    {
        alignmentPatternCenters:
            [6, 26, 52, 78, 104, 130],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(5, 115),
                QRVersion.ecb(10, 116)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(19, 47),
                QRVersion.ecb(10, 48)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(15, 24),
                QRVersion.ecb(25, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(23, 15),
                QRVersion.ecb(25, 16)
            )
        }
    },


    /*
     * VERSION 31
     */
    {
        alignmentPatternCenters:
            [6, 30, 56, 82, 108, 134],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(13, 115),
                QRVersion.ecb(3, 116)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(2, 46),
                QRVersion.ecb(29, 47)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(42, 24),
                QRVersion.ecb(1, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(23, 15),
                QRVersion.ecb(28, 16)
            )
        }
    },


    /*
     * VERSION 32
     */
    {
        alignmentPatternCenters:
            [6, 34, 60, 86, 112, 138],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(17, 115)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(10, 46),
                QRVersion.ecb(23, 47)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(10, 24),
                QRVersion.ecb(35, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(19, 15),
                QRVersion.ecb(35, 16)
            )
        }
    },


    /*
     * VERSION 33
     */
    {
        alignmentPatternCenters:
            [6, 30, 58, 86, 114, 142],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(17, 115),
                QRVersion.ecb(1, 116)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(14, 46),
                QRVersion.ecb(21, 47)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(29, 24),
                QRVersion.ecb(19, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(11, 15),
                QRVersion.ecb(46, 16)
            )
        }
    },


    /*
     * VERSION 34
     */
    {
        alignmentPatternCenters:
            [6, 34, 62, 90, 118, 146],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(13, 115),
                QRVersion.ecb(6, 116)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(14, 46),
                QRVersion.ecb(23, 47)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(44, 24),
                QRVersion.ecb(7, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(59, 16),
                QRVersion.ecb(1, 17)
            )
        }
    },


    /*
     * VERSION 35
     */
    {
        alignmentPatternCenters:
            [6, 30, 54, 78, 102, 126, 150],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(12, 121),
                QRVersion.ecb(7, 122)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(12, 47),
                QRVersion.ecb(26, 48)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(39, 24),
                QRVersion.ecb(14, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(22, 15),
                QRVersion.ecb(41, 16)
            )
        }
    },


    /*
     * VERSION 36
     */
    {
        alignmentPatternCenters:
            [6, 24, 50, 76, 102, 128, 154],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(6, 121),
                QRVersion.ecb(14, 122)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(6, 47),
                QRVersion.ecb(34, 48)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(46, 24),
                QRVersion.ecb(10, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(2, 15),
                QRVersion.ecb(64, 16)
            )
        }
    },


    /*
     * VERSION 37
     */
    {
        alignmentPatternCenters:
            [6, 28, 54, 80, 106, 132, 158],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(17, 122),
                QRVersion.ecb(4, 123)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(29, 46),
                QRVersion.ecb(14, 47)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(49, 24),
                QRVersion.ecb(10, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(24, 15),
                QRVersion.ecb(46, 16)
            )
        }
    },


    /*
     * VERSION 38
     */
    {
        alignmentPatternCenters:
            [6, 32, 58, 84, 110, 136, 162],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(4, 122),
                QRVersion.ecb(18, 123)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(13, 46),
                QRVersion.ecb(32, 47)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(48, 24),
                QRVersion.ecb(14, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(42, 15),
                QRVersion.ecb(32, 16)
            )
        }
    },


    /*
     * VERSION 39
     */
    {
        alignmentPatternCenters:
            [6, 26, 54, 82, 110, 138, 166],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(20, 117),
                QRVersion.ecb(4, 118)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(40, 47),
                QRVersion.ecb(7, 48)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(43, 24),
                QRVersion.ecb(22, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(10, 15),
                QRVersion.ecb(67, 16)
            )
        }
    },


    /*
     * VERSION 40
     */
    {
        alignmentPatternCenters:
            [6, 30, 58, 86, 114, 142, 170],

        ecBlocks: {
            L: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(19, 118),
                QRVersion.ecb(6, 119)
            ),

            M: QRVersion.ecBlocks(
                28,
                QRVersion.ecb(18, 47),
                QRVersion.ecb(31, 48)
            ),

            Q: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(34, 24),
                QRVersion.ecb(34, 25)
            ),

            H: QRVersion.ecBlocks(
                30,
                QRVersion.ecb(20, 15),
                QRVersion.ecb(61, 16)
            )
        }
    }
];