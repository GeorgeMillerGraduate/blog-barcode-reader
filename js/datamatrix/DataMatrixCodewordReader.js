/**
 * DataMatrixCodewordReader
 *
 * Reads raw ECC200 codewords from a sampled Data Matrix symbol.
 *
 * Input:
 *   Complete Data Matrix BitMatrix including finder/timing borders.
 *
 * Output:
 *   Array of raw ECC200 codewords in placement order.
 *
 * Requires:
 *   BitMatrix.js
 */
class DataMatrixCodewordReader {

    static DEBUG = true;

    constructor(options = {}) {
        this.options = {
            strict: true,
            ...options
        };
    }

    // =========================================================
    // DEBUG
    // =========================================================

    debug(...args) {
        if (DataMatrixCodewordReader.DEBUG) {
            console.log(
                "[DataMatrixCodewordReader]",
                ...args
            );
        }
    }

    // =========================================================
    // PUBLIC API
    // =========================================================

    read(matrix, symbolInfo) {

        this.debug("========================================");
        this.debug("START DATA MATRIX CODEWORD READ");
        this.debug("========================================");

        this.validateInput(
            matrix,
            symbolInfo
        );

        this.debug(
            "Input matrix:",
            `${matrix.width}x${matrix.height}`
        );

        this.debug(
            "Symbol info:",
            symbolInfo
        );

        // Strip finder/timing borders from each data region.
        const placementMatrix =
            this.extractDataRegion(
                matrix,
                symbolInfo
            );

        this.debug(
            "Placement matrix:",
            `${placementMatrix.width}x${placementMatrix.height}`
        );

        // Read ECC200 module placement.
        const codewords =
            this.readPlacementMatrix(
                placementMatrix
            );

        const expected =
            this.getExpectedCodewordCount(
                symbolInfo
            );

        this.debug(
            "Expected codewords:",
            expected
        );

        this.debug(
            "Actual codewords:",
            codewords.length
        );

        this.debug(
            "Raw codewords:",
            codewords
        );

        this.debug(
            "Raw codewords HEX:",
            codewords
                .map(
                    value =>
                        value
                            .toString(16)
                            .padStart(2, "0")
                            .toUpperCase()
                )
                .join(" ")
        );

        if (
            expected !== null &&
            codewords.length !== expected
        ) {
            throw new Error(
                "Data Matrix codeword count mismatch. " +
                `Expected ${expected}, read ${codewords.length}.`
            );
        }

        this.debug(
            "Codeword count validation: OK"
        );

        this.debug("========================================");
        this.debug("END DATA MATRIX CODEWORD READ");
        this.debug("========================================");

        return codewords;
    }

    readCodewords(
        matrix,
        symbolInfo
    ) {
        return this.read(
            matrix,
            symbolInfo
        );
    }

    // =========================================================
    // INPUT VALIDATION
    // =========================================================

    validateInput(
        matrix,
        symbolInfo
    ) {

        if (
            typeof BitMatrix === "undefined"
        ) {
            throw new Error(
                "BitMatrix is not loaded."
            );
        }

        if (
            !(matrix instanceof BitMatrix)
        ) {
            throw new TypeError(
                "DataMatrixCodewordReader requires a BitMatrix."
            );
        }

        if (!symbolInfo) {
            throw new TypeError(
                "DataMatrixCodewordReader requires DataMatrixSymbolInfo."
            );
        }

        if (
            matrix.width <= 0 ||
            matrix.height <= 0
        ) {
            throw new Error(
                "Data Matrix symbol has invalid dimensions."
            );
        }
    }

    // =========================================================
    // DATA REGION EXTRACTION
    // =========================================================

    extractDataRegion(
        matrix,
        symbolInfo
    ) {

        const symbolColumns =
            this.getSymbolColumns(
                symbolInfo,
                matrix
            );

        const symbolRows =
            this.getSymbolRows(
                symbolInfo,
                matrix
            );

        this.debug(
            "Complete symbol dimensions:",
            `${symbolColumns}x${symbolRows}`
        );

        this.debug(
            "Actual input dimensions:",
            `${matrix.width}x${matrix.height}`
        );

        /*
         * A caller may supply an already-stripped placement matrix.
         */
        if (
            matrix.width !== symbolColumns ||
            matrix.height !== symbolRows
        ) {

            const expectedDataColumns =
                this.getDataColumns(
                    symbolInfo
                );

            const expectedDataRows =
                this.getDataRows(
                    symbolInfo
                );

            if (
                expectedDataColumns !== null &&
                expectedDataRows !== null &&
                matrix.width === expectedDataColumns &&
                matrix.height === expectedDataRows
            ) {

                this.debug(
                    "Input is already a stripped placement matrix."
                );

                return matrix;
            }

            throw new Error(
                "Data Matrix dimensions do not match symbol information. " +
                `Matrix=${matrix.width}x${matrix.height}, ` +
                `symbol=${symbolColumns}x${symbolRows}.`
            );
        }

        const regionDataColumns =
            this.getRegionDataColumns(
                symbolInfo
            );

        const regionDataRows =
            this.getRegionDataRows(
                symbolInfo
            );

        if (
            regionDataColumns === null ||
            regionDataRows === null
        ) {
            throw new Error(
                "Data Matrix symbol information does not specify " +
                "data-region dimensions."
            );
        }

        const regionSymbolColumns =
            regionDataColumns + 2;

        const regionSymbolRows =
            regionDataRows + 2;

        if (
            symbolColumns % regionSymbolColumns !== 0 ||
            symbolRows % regionSymbolRows !== 0
        ) {
            throw new Error(
                "Data Matrix region geometry is inconsistent with " +
                "the complete symbol dimensions."
            );
        }

        const horizontalRegions =
            symbolColumns /
            regionSymbolColumns;

        const verticalRegions =
            symbolRows /
            regionSymbolRows;

        const dataColumns =
            horizontalRegions *
            regionDataColumns;

        const dataRows =
            verticalRegions *
            regionDataRows;

        this.debug(
            "Region data dimensions:",
            `${regionDataColumns}x${regionDataRows}`
        );

        this.debug(
            "Region layout:",
            `${horizontalRegions} across x ${verticalRegions} down`
        );

        this.debug(
            "Final placement dimensions:",
            `${dataColumns}x${dataRows}`
        );

        const result =
            new BitMatrix(
                dataColumns,
                dataRows
            );

        /*
         * Every ECC200 data region is surrounded by a one-module
         * finder/timing border. Copy only the interior modules.
         */
        for (
            let regionRow = 0;
            regionRow < verticalRegions;
            regionRow++
        ) {

            const sourceRegionY =
                regionRow *
                regionSymbolRows;

            const targetRegionY =
                regionRow *
                regionDataRows;

            for (
                let regionColumn = 0;
                regionColumn < horizontalRegions;
                regionColumn++
            ) {

                const sourceRegionX =
                    regionColumn *
                    regionSymbolColumns;

                const targetRegionX =
                    regionColumn *
                    regionDataColumns;

                for (
                    let y = 0;
                    y < regionDataRows;
                    y++
                ) {

                    const sourceY =
                        sourceRegionY +
                        1 +
                        y;

                    const targetY =
                        targetRegionY +
                        y;

                    for (
                        let x = 0;
                        x < regionDataColumns;
                        x++
                    ) {

                        const sourceX =
                            sourceRegionX +
                            1 +
                            x;

                        const targetX =
                            targetRegionX +
                            x;

                        if (
                            matrix.get(
                                sourceX,
                                sourceY
                            )
                        ) {
                            result.set(
                                targetX,
                                targetY
                            );
                        }
                    }
                }
            }
        }

        this.debug(
            "Data region extraction complete."
        );

        return result;
    }

    // =========================================================
    // ECC200 PLACEMENT TRAVERSAL
    // =========================================================

    readPlacementMatrix(matrix) {

        const numRows =
            matrix.height;

        const numColumns =
            matrix.width;

        if (
            numRows <= 0 ||
            numColumns <= 0
        ) {
            throw new Error(
                "Invalid Data Matrix placement dimensions."
            );
        }

        this.debug("----------------------------------------");
        this.debug("ECC200 PLACEMENT TRAVERSAL");
        this.debug(
            "Placement dimensions:",
            `${numColumns}x${numRows}`
        );

        const readMapping =
            this.createBooleanMatrix(
                numColumns,
                numRows
            );

        const codewords = [];

        /*
         * ECC200 traversal starts here.
         *
         * IMPORTANT:
         *
         * Special corner patterns do NOT manually alter row/column.
         * The diagonal sweeps below advance the traversal.
         */
        let row = 4;
        let column = 0;

        do {

            // =================================================
            // CORNER 1
            // =================================================

            if (
                row === numRows &&
                column === 0
            ) {

                this.debug(
                    "Corner 1 triggered",
                    {
                        row,
                        column,
                        codewordIndex:
                            codewords.length
                    }
                );

                codewords.push(
                    this.readCorner1(
                        matrix,
                        readMapping
                    )
                );
            }

            // =================================================
            // CORNER 2
            // =================================================

            if (
                row === numRows - 2 &&
                column === 0 &&
                numColumns % 4 !== 0
            ) {

                this.debug(
                    "Corner 2 triggered",
                    {
                        row,
                        column,
                        codewordIndex:
                            codewords.length
                    }
                );

                codewords.push(
                    this.readCorner2(
                        matrix,
                        readMapping
                    )
                );
            }

            // =================================================
            // CORNER 3
            // =================================================

            if (
                row === numRows + 4 &&
                column === 2 &&
                numColumns % 8 === 0
            ) {

                this.debug(
                    "Corner 3 triggered",
                    {
                        row,
                        column,
                        codewordIndex:
                            codewords.length
                    }
                );

                codewords.push(
                    this.readCorner3(
                        matrix,
                        readMapping
                    )
                );
            }

            // =================================================
            // CORNER 4
            // =================================================

            if (
                row === numRows - 2 &&
                column === 0 &&
                numColumns % 8 === 4
            ) {

                this.debug(
                    "Corner 4 triggered",
                    {
                        row,
                        column,
                        codewordIndex:
                            codewords.length
                    }
                );

                codewords.push(
                    this.readCorner4(
                        matrix,
                        readMapping
                    )
                );
            }

            // =================================================
            // SWEEP UP AND RIGHT
            // =================================================

            do {

                if (
                    row < numRows &&
                    column >= 0 &&
                    !this.isRead(
                        readMapping,
                        column,
                        row
                    )
                ) {

                    codewords.push(
                        this.readUtah(
                            matrix,
                            readMapping,
                            row,
                            column
                        )
                    );
                }

                row -= 2;
                column += 2;

            } while (
                row >= 0 &&
                column < numColumns
            );

            row += 1;
            column += 3;

            // =================================================
            // SWEEP DOWN AND LEFT
            // =================================================

            do {

                if (
                    row >= 0 &&
                    column < numColumns &&
                    !this.isRead(
                        readMapping,
                        column,
                        row
                    )
                ) {

                    codewords.push(
                        this.readUtah(
                            matrix,
                            readMapping,
                            row,
                            column
                        )
                    );
                }

                row += 2;
                column -= 2;

            } while (
                row < numRows &&
                column >= 0
            );

            row += 3;
            column += 1;

        } while (
            row < numRows ||
            column < numColumns
        );

        this.debug(
            "ECC200 traversal finished."
        );

        this.debug(
            "Codewords produced:",
            codewords.length
        );

        this.debug("----------------------------------------");

        return codewords;
    }

    // =========================================================
    // UTAH PATTERN
    // =========================================================

    readUtah(
        matrix,
        readMapping,
        row,
        column
    ) {

        let value = 0;

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                row - 2,
                column - 2
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                row - 2,
                column - 1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                row - 1,
                column - 2
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                row - 1,
                column - 1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                row - 1,
                column
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                row,
                column - 2
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                row,
                column - 1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                row,
                column
            )
        );

        return value;
    }

    // =========================================================
    // CORNER 1
    // =========================================================

    readCorner1(
        matrix,
        readMapping
    ) {

        const rows =
            matrix.height;

        const columns =
            matrix.width;

        let value = 0;

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                rows - 1,
                0
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                rows - 1,
                1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                rows - 1,
                2
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                0,
                columns - 2
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                0,
                columns - 1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                1,
                columns - 1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                2,
                columns - 1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                3,
                columns - 1
            )
        );

        return value;
    }

    // =========================================================
    // CORNER 2
    // =========================================================

    readCorner2(
        matrix,
        readMapping
    ) {

        const rows =
            matrix.height;

        const columns =
            matrix.width;

        let value = 0;

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                rows - 3,
                0
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                rows - 2,
                0
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                rows - 1,
                0
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                0,
                columns - 4
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                0,
                columns - 3
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                0,
                columns - 2
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                0,
                columns - 1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                1,
                columns - 1
            )
        );

        return value;
    }

    // =========================================================
    // CORNER 3
    // =========================================================

    readCorner3(
        matrix,
        readMapping
    ) {

        const rows =
            matrix.height;

        const columns =
            matrix.width;

        let value = 0;

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                rows - 1,
                0
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                rows - 1,
                columns - 1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                0,
                columns - 3
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                0,
                columns - 2
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                0,
                columns - 1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                1,
                columns - 3
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                1,
                columns - 2
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                1,
                columns - 1
            )
        );

        return value;
    }

    // =========================================================
    // CORNER 4
    // =========================================================

    readCorner4(
        matrix,
        readMapping
    ) {

        const rows =
            matrix.height;

        const columns =
            matrix.width;

        let value = 0;

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                rows - 3,
                0
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                rows - 2,
                0
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                rows - 1,
                0
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                0,
                columns - 2
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                0,
                columns - 1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                1,
                columns - 1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                2,
                columns - 1
            )
        );

        value = this.appendBit(
            value,
            this.readModule(
                matrix,
                readMapping,
                3,
                columns - 1
            )
        );

        return value;
    }

    // =========================================================
    // MODULE READING / ECC200 WRAPPING
    // =========================================================

    readModule(
        matrix,
        readMapping,
        row,
        column
    ) {

        const rows =
            matrix.height;

        const columns =
            matrix.width;

        /*
         * ECC200 wrap rule.
         *
         * This is not ordinary modulo wrapping. Moving through a
         * negative edge also offsets the coordinate on the other
         * axis.
         */
        if (
            row < 0
        ) {

            row += rows;

            column +=
                4 -
                (
                    (rows + 4) %
                    8
                );
        }

        if (
            column < 0
        ) {

            column += columns;

            row +=
                4 -
                (
                    (columns + 4) %
                    8
                );
        }

        /*
         * At this point a valid ECC200 traversal should have
         * produced an in-range coordinate.
         *
         * Do not silently modulo malformed coordinates because
         * doing so can turn a traversal error into apparently valid
         * but corrupt codewords.
         */
        if (
            row < 0 ||
            row >= rows ||
            column < 0 ||
            column >= columns
        ) {

            throw new Error(
                "ECC200 placement produced an invalid module " +
                `coordinate (${column}, ${row}) for ` +
                `${columns}x${rows}.`
            );
        }

        this.markRead(
            readMapping,
            column,
            row
        );

        return matrix.get(
            column,
            row
        );
    }

    // =========================================================
    // BIT ASSEMBLY
    // =========================================================

    appendBit(
        value,
        bit
    ) {

        value <<= 1;

        if (bit) {
            value |= 1;
        }

        return (
            value &
            0xFF
        );
    }

    // =========================================================
    // READ MAPPING
    // =========================================================

    createBooleanMatrix(
        width,
        height
    ) {

        const result =
            new Array(
                height
            );

        for (
            let y = 0;
            y < height;
            y++
        ) {

            result[y] =
                new Array(
                    width
                ).fill(
                    false
                );
        }

        return result;
    }

    isRead(
        mapping,
        x,
        y
    ) {

        if (
            y < 0 ||
            y >= mapping.length
        ) {
            return false;
        }

        if (
            x < 0 ||
            x >= mapping[y].length
        ) {
            return false;
        }

        return mapping[y][x];
    }

    markRead(
        mapping,
        x,
        y
    ) {

        if (
            y < 0 ||
            y >= mapping.length
        ) {
            throw new Error(
                `Data Matrix placement row outside matrix: ${y}`
            );
        }

        if (
            x < 0 ||
            x >= mapping[y].length
        ) {
            throw new Error(
                `Data Matrix placement column outside matrix: ${x}`
            );
        }

        mapping[y][x] = true;
    }

    // =========================================================
    // SYMBOL INFO ADAPTERS
    // =========================================================

    getSymbolColumns(
        info,
        matrix
    ) {

        return this.firstNumber(

            this.callNumber(
                info,
                "getSymbolWidth"
            ),

            this.callNumber(
                info,
                "getSymbolColumns"
            ),

            info.symbolWidth,
            info.symbolColumns,
            info.matrixWidth,
            info.columns,

            matrix.width
        );
    }

    getSymbolRows(
        info,
        matrix
    ) {

        return this.firstNumber(

            this.callNumber(
                info,
                "getSymbolHeight"
            ),

            this.callNumber(
                info,
                "getSymbolRows"
            ),

            info.symbolHeight,
            info.symbolRows,
            info.matrixHeight,
            info.rows,

            matrix.height
        );
    }

    getRegionDataColumns(info) {

        return this.firstNumber(

            this.callNumber(
                info,
                "getDataRegionWidth"
            ),

            this.callNumber(
                info,
                "getDataRegionColumns"
            ),

            this.callNumber(
                info,
                "getMatrixWidth"
            ),

            info.dataRegionWidth,
            info.dataRegionColumns,
            info.regionDataWidth,
            info.regionDataColumns,
            info.matrixWidth
        );
    }

    getRegionDataRows(info) {

        return this.firstNumber(

            this.callNumber(
                info,
                "getDataRegionHeight"
            ),

            this.callNumber(
                info,
                "getDataRegionRows"
            ),

            this.callNumber(
                info,
                "getMatrixHeight"
            ),

            info.dataRegionHeight,
            info.dataRegionRows,
            info.regionDataHeight,
            info.regionDataRows,
            info.matrixHeight
        );
    }

    getDataColumns(info) {

        const explicit =
            this.firstNumber(

                this.callNumber(
                    info,
                    "getDataWidth"
                ),

                this.callNumber(
                    info,
                    "getDataColumns"
                ),

                info.dataWidth,
                info.dataColumns
            );

        if (
            explicit !== null
        ) {
            return explicit;
        }

        const symbolColumns =
            this.firstNumber(

                this.callNumber(
                    info,
                    "getSymbolWidth"
                ),

                this.callNumber(
                    info,
                    "getSymbolColumns"
                ),

                info.symbolWidth,
                info.symbolColumns
            );

        const regionColumns =
            this.getRegionDataColumns(
                info
            );

        if (
            symbolColumns === null ||
            regionColumns === null
        ) {
            return null;
        }

        const regionSymbolColumns =
            regionColumns + 2;

        if (
            symbolColumns %
            regionSymbolColumns !== 0
        ) {
            return null;
        }

        return (
            symbolColumns /
            regionSymbolColumns *
            regionColumns
        );
    }

    getDataRows(info) {

        const explicit =
            this.firstNumber(

                this.callNumber(
                    info,
                    "getDataHeight"
                ),

                this.callNumber(
                    info,
                    "getDataRows"
                ),

                info.dataHeight,
                info.dataRows
            );

        if (
            explicit !== null
        ) {
            return explicit;
        }

        const symbolRows =
            this.firstNumber(

                this.callNumber(
                    info,
                    "getSymbolHeight"
                ),

                this.callNumber(
                    info,
                    "getSymbolRows"
                ),

                info.symbolHeight,
                info.symbolRows
            );

        const regionRows =
            this.getRegionDataRows(
                info
            );

        if (
            symbolRows === null ||
            regionRows === null
        ) {
            return null;
        }

        const regionSymbolRows =
            regionRows + 2;

        if (
            symbolRows %
            regionSymbolRows !== 0
        ) {
            return null;
        }

        return (
            symbolRows /
            regionSymbolRows *
            regionRows
        );
    }

    // =========================================================
    // EXPECTED CODEWORD COUNT
    // =========================================================

    getExpectedCodewordCount(info) {

        const total =
            this.firstNumber(

                this.callNumber(
                    info,
                    "getTotalCodewords"
                ),

                this.callNumber(
                    info,
                    "getCodewordCount"
                ),

                info.totalCodewords,
                info.codewordCount
            );

        if (
            total !== null
        ) {
            return total;
        }

        const data =
            this.firstNumber(

                this.callNumber(
                    info,
                    "getDataCapacity"
                ),

                this.callNumber(
                    info,
                    "getDataCodewords"
                ),

                info.dataCapacity,
                info.dataCodewords
            );

        const error =
            this.firstNumber(

                this.callNumber(
                    info,
                    "getErrorCodewords"
                ),

                this.callNumber(
                    info,
                    "getErrorCodewordCount"
                ),

                this.callNumber(
                    info,
                    "getErrorCorrectionCodewords"
                ),

                info.errorCodewords,
                info.errorCodewordCount,
                info.errorCorrectionCodewords,
                info.ecCodewords
            );

        if (
            data !== null &&
            error !== null
        ) {
            return (
                data +
                error
            );
        }

        return null;
    }

    // =========================================================
    // PROPERTY HELPERS
    // =========================================================

    callNumber(
        object,
        methodName
    ) {

        if (
            !object ||
            typeof object[methodName] !== "function"
        ) {
            return null;
        }

        try {

            const value =
                object[methodName]();

            if (
                Number.isFinite(
                    value
                )
            ) {
                return Number(
                    value
                );
            }

        } catch (error) {
            return null;
        }

        return null;
    }

    firstNumber(...values) {

        for (
            let i = 0;
            i < values.length;
            i++
        ) {

            const value =
                values[i];

            if (
                value !== null &&
                value !== undefined &&
                value !== "" &&
                Number.isFinite(
                    Number(
                        value
                    )
                )
            ) {
                return Number(
                    value
                );
            }
        }

        return null;
    }
}