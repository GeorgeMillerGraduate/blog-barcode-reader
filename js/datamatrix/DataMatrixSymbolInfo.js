/**
 * DataMatrixSymbolInfo
 *
 * Describes the physical and error-correction layout of an
 * ECC200 Data Matrix symbol.
 *
 * Stores:
 *
 * - Complete symbol dimensions
 * - Data-region dimensions
 * - Data codeword capacity
 * - Error-correction codeword capacity
 * - Reed-Solomon block count
 * - Data codewords per RS block
 * - Error codewords per RS block
 *
 * Used by:
 *
 * - DataMatrixReader.js
 * - DataMatrixCodewordReader.js
 * - DataMatrixErrorCorrection.js
 *
 * Browser-global class.
 */
class DataMatrixSymbolInfo {

    /**
     * @param {number} symbolRows
     * @param {number} symbolColumns
     * @param {number} dataRegionRows
     * @param {number} dataRegionColumns
     * @param {number} dataCodewords
     * @param {number} errorCodewords
     * @param {number[]} dataCodewordsPerBlock
     * @param {number[]} errorCodewordsPerBlock
     */
    constructor(
        symbolRows,
        symbolColumns,
        dataRegionRows,
        dataRegionColumns,
        dataCodewords,
        errorCodewords,
        dataCodewordsPerBlock = null,
        errorCodewordsPerBlock = null
    ) {

        this.symbolRows =
            symbolRows;

        this.symbolColumns =
            symbolColumns;

        this.dataRegionRows =
            dataRegionRows;

        this.dataRegionColumns =
            dataRegionColumns;

        this.dataCodewords =
            dataCodewords;

        this.errorCodewords =
            errorCodewords;


        /*
         * Compatibility aliases used by the other Data Matrix
         * scanner classes.
         */
        this.rows =
            symbolRows;

        this.columns =
            symbolColumns;

        this.symbolHeight =
            symbolRows;

        this.symbolWidth =
            symbolColumns;

        this.dataRegionHeight =
            dataRegionRows;

        this.dataRegionWidth =
            dataRegionColumns;

        this.dataCapacity =
            dataCodewords;

        this.totalCodewords =
            dataCodewords +
            errorCodewords;


        /*
         * Number of independently bordered data regions.
         */
        this.regionRows =
            symbolRows /
            (dataRegionRows + 2);

        this.regionColumns =
            symbolColumns /
            (dataRegionColumns + 2);


        if (
            !Number.isInteger(
                this.regionRows
            ) ||
            !Number.isInteger(
                this.regionColumns
            )
        ) {

            throw new Error(
                "Invalid Data Matrix region configuration: " +
                `${symbolColumns}x${symbolRows}.`
            );
        }


        /*
         * Placement matrix dimensions after finder/timing
         * borders have been removed.
         */
        this.mappingMatrixRows =
            this.regionRows *
            dataRegionRows;

        this.mappingMatrixColumns =
            this.regionColumns *
            dataRegionColumns;


        /*
         * -----------------------------------------------------
         * REED-SOLOMON BLOCK INFORMATION
         * -----------------------------------------------------
         */

        if (
            dataCodewordsPerBlock ===
            null
        ) {

            dataCodewordsPerBlock =
                [
                    dataCodewords
                ];
        }


        if (
            errorCodewordsPerBlock ===
            null
        ) {

            errorCodewordsPerBlock =
                [
                    errorCodewords
                ];
        }


        this.dataCodewordsPerBlock =
            Array.from(
                dataCodewordsPerBlock
            );


        this.errorCodewordsPerBlock =
            Array.from(
                errorCodewordsPerBlock
            );


        this.interleavedBlockCount =
            this.dataCodewordsPerBlock
                .length;


        this.blockCount =
            this.interleavedBlockCount;

        this.rsBlockCount =
            this.interleavedBlockCount;


        this.validate();
    }


    /*
     * =========================================================
     * VALIDATION
     * =========================================================
     */

    validate() {

        const dimensions = [
            this.symbolRows,
            this.symbolColumns,
            this.dataRegionRows,
            this.dataRegionColumns,
            this.dataCodewords,
            this.errorCodewords
        ];


        for (
            let i = 0;
            i < dimensions.length;
            i++
        ) {

            if (
                !Number.isInteger(
                    dimensions[i]
                ) ||
                dimensions[i] <= 0
            ) {

                throw new Error(
                    "DataMatrixSymbolInfo contains an invalid numeric value."
                );
            }
        }


        if (
            this.dataCodewordsPerBlock
                .length !==
            this.errorCodewordsPerBlock
                .length
        ) {

            throw new Error(
                "Data Matrix RS block arrays have different lengths."
            );
        }


        let dataTotal = 0;
        let errorTotal = 0;


        for (
            let i = 0;
            i <
            this.dataCodewordsPerBlock
                .length;
            i++
        ) {

            const data =
                this.dataCodewordsPerBlock[
                    i
                ];

            const error =
                this.errorCodewordsPerBlock[
                    i
                ];


            if (
                !Number.isInteger(data) ||
                data <= 0 ||
                !Number.isInteger(error) ||
                error <= 0
            ) {

                throw new Error(
                    "Invalid Data Matrix RS block size."
                );
            }


            dataTotal +=
                data;

            errorTotal +=
                error;
        }


        if (
            dataTotal !==
            this.dataCodewords
        ) {

            throw new Error(
                "Data Matrix RS data block total does not match symbol capacity."
            );
        }


        if (
            errorTotal !==
            this.errorCodewords
        ) {

            throw new Error(
                "Data Matrix RS error block total does not match symbol capacity."
            );
        }
    }


    /*
     * =========================================================
     * LOOKUP
     * =========================================================
     */

    /**
     * Finds symbol information using complete symbol dimensions.
     *
     * IMPORTANT:
     *
     * Arguments are:
     *
     *     columns, rows
     *
     * because DataMatrixReader supplies width before height.
     *
     * @param {number} columns
     * @param {number} rows
     *
     * @returns {DataMatrixSymbolInfo}
     */
    static forDimensions(
        columns,
        rows
    ) {

        if (
            !Number.isInteger(columns) ||
            !Number.isInteger(rows)
        ) {

            throw new TypeError(
                "Data Matrix dimensions must be integers."
            );
        }


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


            if (
                info.symbolColumns ===
                    columns &&
                info.symbolRows ===
                    rows
            ) {

                return info;
            }
        }


        throw new Error(
            "Unsupported Data Matrix dimensions: " +
            `${columns}x${rows}.`
        );
    }


    /**
     * Alias for forDimensions().
     */
    static lookup(
        columns,
        rows
    ) {

        return DataMatrixSymbolInfo
            .forDimensions(
                columns,
                rows
            );
    }


    /**
     * Alias for forDimensions().
     */
    static getSymbolInfo(
        columns,
        rows
    ) {

        return DataMatrixSymbolInfo
            .forDimensions(
                columns,
                rows
            );
    }


    /**
     * Returns true when dimensions correspond to a supported
     * ECC200 symbol.
     */
    static isSupported(
        columns,
        rows
    ) {

        return DataMatrixSymbolInfo
            .SYMBOLS
            .some(
                info =>
                    info.symbolColumns ===
                        columns &&
                    info.symbolRows ===
                        rows
            );
    }


    /*
     * =========================================================
     * GETTERS
     * =========================================================
     */

    getSymbolRows() {

        return this.symbolRows;
    }


    getSymbolColumns() {

        return this.symbolColumns;
    }


    getSymbolHeight() {

        return this.symbolRows;
    }


    getSymbolWidth() {

        return this.symbolColumns;
    }


    getDataRegionRows() {

        return this.dataRegionRows;
    }


    getDataRegionColumns() {

        return this.dataRegionColumns;
    }


    getDataRegionHeight() {

        return this.dataRegionRows;
    }


    getDataRegionWidth() {

        return this.dataRegionColumns;
    }


    getDataCodewords() {

        return this.dataCodewords;
    }


    getDataCapacity() {

        return this.dataCodewords;
    }


    getErrorCodewords() {

        return this.errorCodewords;
    }


    getTotalCodewords() {

        return this.totalCodewords;
    }


    getInterleavedBlockCount() {

        return this.interleavedBlockCount;
    }


    getBlockCount() {

        return this.blockCount;
    }


    getRSBlockCount() {

        return this.rsBlockCount;
    }


    getDataCodewordsPerBlock() {

        return Array.from(
            this.dataCodewordsPerBlock
        );
    }


    getErrorCodewordsPerBlock() {

        return Array.from(
            this.errorCodewordsPerBlock
        );
    }


    getRegionRows() {

        return this.regionRows;
    }


    getRegionColumns() {

        return this.regionColumns;
    }


    getMappingMatrixRows() {

        return this.mappingMatrixRows;
    }


    getMappingMatrixColumns() {

        return this.mappingMatrixColumns;
    }


    isRectangular() {

        return (
            this.symbolRows !==
            this.symbolColumns
        );
    }
}


/*
 * =============================================================
 * ECC200 SYMBOL TABLE
 * =============================================================
 *
 * Constructor:
 *
 * new DataMatrixSymbolInfo(
 *
 *     symbol rows,
 *     symbol columns,
 *
 *     data-region rows,
 *     data-region columns,
 *
 *     data codewords,
 *     error codewords,
 *
 *     data codewords per RS block,
 *     error codewords per RS block
 * )
 *
 * This table includes the classic ECC200 square and rectangular
 * symbol sizes.
 * =============================================================
 */

DataMatrixSymbolInfo.SYMBOLS = [

    /*
     * ---------------------------------------------------------
     * SQUARE SYMBOLS
     * ---------------------------------------------------------
     */

    new DataMatrixSymbolInfo(
        10, 10,
        8, 8,
        3, 5
    ),

    new DataMatrixSymbolInfo(
        12, 12,
        10, 10,
        5, 7
    ),

    new DataMatrixSymbolInfo(
        14, 14,
        12, 12,
        8, 10
    ),

    new DataMatrixSymbolInfo(
        16, 16,
        14, 14,
        12, 12
    ),

    new DataMatrixSymbolInfo(
        18, 18,
        16, 16,
        18, 14
    ),

    new DataMatrixSymbolInfo(
        20, 20,
        18, 18,
        22, 18
    ),

    new DataMatrixSymbolInfo(
        22, 22,
        20, 20,
        30, 20
    ),

    new DataMatrixSymbolInfo(
        24, 24,
        22, 22,
        36, 24
    ),

    new DataMatrixSymbolInfo(
        26, 26,
        24, 24,
        44, 28
    ),


    /*
     * 32x32 begins using multiple independently bordered
     * data regions.
     */
    new DataMatrixSymbolInfo(
        32, 32,
        14, 14,
        62, 36
    ),

    new DataMatrixSymbolInfo(
        36, 36,
        16, 16,
        86, 42
    ),

    new DataMatrixSymbolInfo(
        40, 40,
        18, 18,
        114, 48
    ),

    new DataMatrixSymbolInfo(
        44, 44,
        20, 20,
        144, 56
    ),

    new DataMatrixSymbolInfo(
        48, 48,
        22, 22,
        174, 68
    ),

    new DataMatrixSymbolInfo(
        52, 52,
        24, 24,
        204, 84,

        [102, 102],

        [42, 42]
    ),


    /*
     * ---------------------------------------------------------
     * LARGE SQUARE SYMBOLS
     * ---------------------------------------------------------
     */

    new DataMatrixSymbolInfo(
        64, 64,
        14, 14,
        280, 112,

        [
            140,
            140
        ],

        [
            56,
            56
        ]
    ),


    new DataMatrixSymbolInfo(
        72, 72,
        16, 16,
        368, 144,

        [
            92,
            92,
            92,
            92
        ],

        [
            36,
            36,
            36,
            36
        ]
    ),


    new DataMatrixSymbolInfo(
        80, 80,
        18, 18,
        456, 192,

        [
            114,
            114,
            114,
            114
        ],

        [
            48,
            48,
            48,
            48
        ]
    ),


    new DataMatrixSymbolInfo(
        88, 88,
        20, 20,
        576, 224,

        [
            144,
            144,
            144,
            144
        ],

        [
            56,
            56,
            56,
            56
        ]
    ),


    new DataMatrixSymbolInfo(
        96, 96,
        22, 22,
        696, 272,

        [
            174,
            174,
            174,
            174
        ],

        [
            68,
            68,
            68,
            68
        ]
    ),


    new DataMatrixSymbolInfo(
        104, 104,
        24, 24,
        816, 336,

        [
            136,
            136,
            136,
            136,
            136,
            136
        ],

        [
            56,
            56,
            56,
            56,
            56,
            56
        ]
    ),


    new DataMatrixSymbolInfo(
        120, 120,
        18, 18,
        1050, 408,

        [
            175,
            175,
            175,
            175,
            175,
            175
        ],

        [
            68,
            68,
            68,
            68,
            68,
            68
        ]
    ),


    new DataMatrixSymbolInfo(
        132, 132,
        20, 20,
        1304, 496,

        [
            163,
            163,
            163,
            163,
            163,
            163,
            163,
            163
        ],

        [
            62,
            62,
            62,
            62,
            62,
            62,
            62,
            62
        ]
    ),


    /*
     * 144x144 is the exceptional ECC200 symbol.
     *
     * It contains ten RS blocks:
     *
     * - 8 blocks with 156 data codewords
     * - 2 blocks with 155 data codewords
     *
     * Each block contains 62 error-correction codewords.
     */
    new DataMatrixSymbolInfo(
        144, 144,
        22, 22,
        1558, 620,

        [
            156,
            156,
            156,
            156,
            156,
            156,
            156,
            156,
            155,
            155
        ],

        [
            62,
            62,
            62,
            62,
            62,
            62,
            62,
            62,
            62,
            62
        ]
    ),


    /*
     * ---------------------------------------------------------
     * RECTANGULAR ECC200 SYMBOLS
     * ---------------------------------------------------------
     */

    new DataMatrixSymbolInfo(
        8, 18,
        6, 16,
        5, 7
    ),

    new DataMatrixSymbolInfo(
        8, 32,
        6, 14,
        10, 11
    ),

    new DataMatrixSymbolInfo(
        12, 26,
        10, 24,
        16, 14
    ),

    new DataMatrixSymbolInfo(
        12, 36,
        10, 16,
        22, 18
    ),

    new DataMatrixSymbolInfo(
        16, 36,
        14, 16,
        32, 24
    ),

    new DataMatrixSymbolInfo(
        16, 48,
        14, 22,
        49, 28
    )
];


/*
 * Freeze the lookup table itself so symbols cannot accidentally
 * be added or removed while scanning.
 */
Object.freeze(
    DataMatrixSymbolInfo.SYMBOLS
);