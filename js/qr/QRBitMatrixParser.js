/**
 * QRBitMatrixParser
 *
 * Parses a detected, perspective-corrected QR Code BitMatrix.
 *
 * Responsibilities:
 *
 * - Read format information
 * - Read version information
 * - Determine the data mask
 * - Build the function-pattern mask
 * - Unmask data modules
 * - Extract raw QR codewords in specification zig-zag order
 *
 * Requires:
 *
 * - BitMatrix.js
 * - QRFormatInformation.js
 * - QRVersion.js
 */
class QRBitMatrixParser {

    /**
     * @param {BitMatrix} bitMatrix
     */
    constructor(bitMatrix) {

        if (!(bitMatrix instanceof BitMatrix)) {
            throw new TypeError(
                "QRBitMatrixParser requires a BitMatrix."
            );
        }

        if (bitMatrix.width !== bitMatrix.height) {
            throw new Error(
                "QR Code BitMatrix must be square."
            );
        }

        const dimension = bitMatrix.height;

        /*
         * QR dimensions:
         *
         * V1  = 21
         * V2  = 25
         * ...
         * V40 = 177
         *
         * dimension = 17 + 4 * version
         */
        if (
            dimension < 21 ||
            dimension > 177 ||
            (dimension & 0x03) !== 1
        ) {
            throw new Error(
                `Invalid QR Code dimension: ${dimension}`
            );
        }

        this.bitMatrix = bitMatrix;
        this.dimension = dimension;

        this.parsedVersion = null;
        this.parsedFormatInfo = null;

        this.unmasked = false;
    }


    /**
     * Read QR format information.
     *
     * @returns {QRFormatInformation}
     */
    readFormatInformation() {

        if (this.parsedFormatInfo !== null) {
            return this.parsedFormatInfo;
        }

        let formatInfoBits1 = 0;

        /*
         * First format-information copy.
         *
         * This ordering follows the QR specification / ZXing
         * parser ordering.
         */

        for (let i = 0; i < 6; i++) {

            formatInfoBits1 =
                this.copyBit(
                    i,
                    8,
                    formatInfoBits1
                );
        }

        formatInfoBits1 =
            this.copyBit(
                7,
                8,
                formatInfoBits1
            );

        formatInfoBits1 =
            this.copyBit(
                8,
                8,
                formatInfoBits1
            );

        formatInfoBits1 =
            this.copyBit(
                8,
                7,
                formatInfoBits1
            );

        for (let j = 5; j >= 0; j--) {

            formatInfoBits1 =
                this.copyBit(
                    8,
                    j,
                    formatInfoBits1
                );
        }


        /*
         * Second copy.
         */
        let formatInfoBits2 = 0;

        const dimension = this.dimension;


        /*
         * Seven vertical bits near bottom-left.
         */
        for (
            let j = dimension - 1;
            j >= dimension - 7;
            j--
        ) {

            formatInfoBits2 =
                this.copyBit(
                    8,
                    j,
                    formatInfoBits2
                );
        }


        /*
         * Eight horizontal bits near top-right.
         */
        for (
            let i = dimension - 8;
            i < dimension;
            i++
        ) {

            formatInfoBits2 =
                this.copyBit(
                    i,
                    8,
                    formatInfoBits2
                );
        }


        if (
            typeof QRFormatInformation ===
            "undefined"
        ) {
            throw new Error(
                "QRFormatInformation.js must be loaded before QRBitMatrixParser."
            );
        }


        let result = null;


        if (
            typeof QRFormatInformation
                .decodeFormatInformation ===
            "function"
        ) {

            result =
                QRFormatInformation
                    .decodeFormatInformation(
                        formatInfoBits1,
                        formatInfoBits2
                    );

        } else if (
            typeof QRFormatInformation.decode ===
            "function"
        ) {

            result =
                QRFormatInformation.decode(
                    formatInfoBits1,
                    formatInfoBits2
                );

        } else {

            throw new Error(
                "QRFormatInformation must provide decodeFormatInformation() or decode()."
            );
        }


        if (!result) {
            throw new Error(
                "Unable to decode QR format information."
            );
        }


        this.parsedFormatInfo = result;

        return result;
    }


    /**
     * Read QR version information.
     *
     * @returns {QRVersion}
     */
    readVersion() {

        if (this.parsedVersion !== null) {
            return this.parsedVersion;
        }


        const provisionalVersion =
            Math.floor(
                (
                    this.dimension -
                    17
                ) /
                4
            );


        /*
         * Versions 1-6 contain no explicit version bits.
         */
        if (provisionalVersion <= 6) {

            this.parsedVersion =
                this.getVersionForNumber(
                    provisionalVersion
                );

            return this.parsedVersion;
        }


        /*
         * --------------------------------------------------
         * Version information copy #1
         *
         * Top-right 3 x 6 area.
         * --------------------------------------------------
         */
        let versionBits = 0;

        const ijMin =
            this.dimension -
            11;


        for (
            let j = 5;
            j >= 0;
            j--
        ) {

            for (
                let i =
                    this.dimension - 9;
                i >= ijMin;
                i--
            ) {

                versionBits =
                    this.copyBit(
                        i,
                        j,
                        versionBits
                    );
            }
        }


        let version =
            this.decodeVersionInformation(
                versionBits
            );


        if (
            version &&
            this.getDimensionForVersion(
                version
            ) === this.dimension
        ) {

            this.parsedVersion = version;

            return version;
        }


        /*
         * --------------------------------------------------
         * Version information copy #2
         *
         * Bottom-left 6 x 3 area.
         * --------------------------------------------------
         */
        versionBits = 0;


        for (
            let i = 5;
            i >= 0;
            i--
        ) {

            for (
                let j =
                    this.dimension - 9;
                j >= ijMin;
                j--
            ) {

                versionBits =
                    this.copyBit(
                        i,
                        j,
                        versionBits
                    );
            }
        }


        version =
            this.decodeVersionInformation(
                versionBits
            );


        if (
            version &&
            this.getDimensionForVersion(
                version
            ) === this.dimension
        ) {

            this.parsedVersion = version;

            return version;
        }


        throw new Error(
            "Unable to decode QR version information."
        );
    }


    /**
     * Extract raw QR codewords.
     *
     * @returns {Uint8Array}
     */
    readCodewords() {

        const formatInfo =
            this.readFormatInformation();

        const version =
            this.readVersion();

        const dataMask =
            this.getDataMask(
                formatInfo
            );


        /*
         * Function modules must NEVER be unmasked or read as
         * payload bits.
         */
        const functionPattern =
            this.buildFunctionPattern(
                version
            );


        /*
         * Remove the selected QR data mask.
         */
        if (!this.unmasked) {

            this.unmaskBitMatrix(
                dataMask,
                functionPattern
            );

            this.unmasked = true;
        }


        const totalCodewords =
            this.getTotalCodewords(
                version
            );


        const result =
            new Uint8Array(
                totalCodewords
            );


        let resultOffset = 0;

        let currentByte = 0;

        let bitsRead = 0;


        /*
         * QR data traversal begins in the bottom-right.
         *
         * Process two columns at a time.
         */
        let readingUp = true;


        for (
            let j =
                this.dimension - 1;
            j > 0;
            j -= 2
        ) {

            /*
             * Column 6 is the vertical timing pattern.
             */
            if (j === 6) {
                j--;
            }


            for (
                let count = 0;
                count < this.dimension;
                count++
            ) {

                const i =
                    readingUp
                        ? this.dimension -
                          1 -
                          count
                        : count;


                /*
                 * Right column first, then left.
                 */
                for (
                    let col = 0;
                    col < 2;
                    col++
                ) {

                    const x =
                        j -
                        col;

                    const y =
                        i;


                    if (
                        functionPattern.get(
                            x,
                            y
                        )
                    ) {
                        continue;
                    }


                    currentByte <<= 1;


                    if (
                        this.bitMatrix.get(
                            x,
                            y
                        )
                    ) {

                        currentByte |= 1;
                    }


                    bitsRead++;


                    if (bitsRead === 8) {

                        if (
                            resultOffset >=
                            totalCodewords
                        ) {

                            /*
                             * Anything beyond the specified
                             * number of codewords must only be
                             * QR remainder bits.
                             */
                            bitsRead = 0;
                            currentByte = 0;

                            continue;
                        }


                        result[
                            resultOffset
                        ] =
                            currentByte &
                            0xFF;


                        resultOffset++;

                        bitsRead = 0;

                        currentByte = 0;
                    }
                }
            }


            readingUp =
                !readingUp;
        }


        if (
            resultOffset !==
            totalCodewords
        ) {

            throw new Error(
                "QR codeword count does not match the version definition. " +
                `Expected ${totalCodewords}, read ${resultOffset}.`
            );
        }


        return result;
    }


    /**
     * Remove QR mask from all data modules.
     *
     * @param {number} dataMask
     * @param {BitMatrix|null} functionPattern
     */
    unmaskBitMatrix(
        dataMask,
        functionPattern = null
    ) {

        if (
            !Number.isInteger(dataMask) ||
            dataMask < 0 ||
            dataMask > 7
        ) {

            throw new RangeError(
                `Invalid QR data mask: ${dataMask}`
            );
        }


        if (functionPattern === null) {

            functionPattern =
                this.buildFunctionPattern(
                    this.readVersion()
                );
        }


        for (
            let y = 0;
            y < this.dimension;
            y++
        ) {

            for (
                let x = 0;
                x < this.dimension;
                x++
            ) {

                /*
                 * Finder, timing, format, alignment and version
                 * modules are never data masked.
                 */
                if (
                    functionPattern.get(
                        x,
                        y
                    )
                ) {
                    continue;
                }


                if (
                    this.isMasked(
                        dataMask,
                        y,
                        x
                    )
                ) {

                    this.bitMatrix.flip(
                        x,
                        y
                    );
                }
            }
        }
    }


    /**
     * Reapply the mask.
     */
    remask() {

        if (!this.unmasked) {
            return;
        }


        const formatInfo =
            this.readFormatInformation();

        const version =
            this.readVersion();

        const dataMask =
            this.getDataMask(
                formatInfo
            );

        const functionPattern =
            this.buildFunctionPattern(
                version
            );


        this.unmaskBitMatrix(
            dataMask,
            functionPattern
        );


        this.unmasked = false;
    }


    /**
     * Determine whether a data module is masked.
     *
     * @param {number} mask
     * @param {number} row
     * @param {number} column
     *
     * @returns {boolean}
     */
    isMasked(
        mask,
        row,
        column
    ) {

        let temp;


        switch (mask) {

            case 0:

                return (
                    (
                        row +
                        column
                    ) &
                    1
                ) === 0;


            case 1:

                return (
                    row &
                    1
                ) === 0;


            case 2:

                return (
                    column %
                    3
                ) === 0;


            case 3:

                return (
                    (
                        row +
                        column
                    ) %
                    3
                ) === 0;


            case 4:

                return (
                    (
                        Math.floor(
                            row / 2
                        ) +
                        Math.floor(
                            column / 3
                        )
                    ) &
                    1
                ) === 0;


            case 5:

                temp =
                    row *
                    column;

                return (
                    (
                        temp &
                        1
                    ) +
                    (
                        temp %
                        3
                    )
                ) === 0;


            case 6:

                temp =
                    row *
                    column;

                return (
                    (
                        (
                            temp &
                            1
                        ) +
                        (
                            temp %
                            3
                        )
                    ) &
                    1
                ) === 0;


            case 7:

                return (
                    (
                        (
                            (
                                row +
                                column
                            ) &
                            1
                        ) +
                        (
                            (
                                row *
                                column
                            ) %
                            3
                        )
                    ) &
                    1
                ) === 0;


            default:

                throw new RangeError(
                    `Invalid QR data mask: ${mask}`
                );
        }
    }


    /**
     * Build the QR function-pattern mask.
     *
     * @param {QRVersion|number} version
     *
     * @returns {BitMatrix}
     */
    buildFunctionPattern(version) {

        /*
         * Prefer the authoritative QRVersion implementation.
         */
        if (
            version &&
            typeof version
                .buildFunctionPattern ===
            "function"
        ) {

            const pattern =
                version
                    .buildFunctionPattern();


            if (!(pattern instanceof BitMatrix)) {

                throw new Error(
                    "QRVersion.buildFunctionPattern() did not return a BitMatrix."
                );
            }


            return pattern;
        }


        /*
         * Compatibility fallback.
         */
        const versionNumber =
            this.getVersionNumber(
                version
            );

        const dimension =
            this.dimension;


        const functionPattern =
            new BitMatrix(
                dimension,
                dimension
            );


        /*
         * Finder patterns, separators and format areas.
         */
        functionPattern.setRegion(
            0,
            0,
            9,
            9
        );


        functionPattern.setRegion(
            dimension - 8,
            0,
            8,
            9
        );


        functionPattern.setRegion(
            0,
            dimension - 8,
            9,
            8
        );


        /*
         * Alignment patterns.
         */
        const centers =
            this.getAlignmentPatternCenters(
                version,
                versionNumber
            );


        for (
            let i = 0;
            i < centers.length;
            i++
        ) {

            const centerY =
                centers[i];


            for (
                let j = 0;
                j < centers.length;
                j++
            ) {

                const centerX =
                    centers[j];


                /*
                 * Alignment patterns which would overlap
                 * finder patterns are omitted.
                 */
                if (
                    (
                        centerX <= 8 &&
                        centerY <= 8
                    ) ||
                    (
                        centerX >=
                            dimension - 8 &&
                        centerY <= 8
                    ) ||
                    (
                        centerX <= 8 &&
                        centerY >=
                            dimension - 8
                    )
                ) {

                    continue;
                }


                functionPattern.setRegion(
                    centerX - 2,
                    centerY - 2,
                    5,
                    5
                );
            }
        }


        /*
         * Timing patterns.
         */
        functionPattern.setRegion(
            6,
            9,
            1,
            dimension - 17
        );


        functionPattern.setRegion(
            9,
            6,
            dimension - 17,
            1
        );


        /*
         * Version information for V7+.
         */
        if (versionNumber > 6) {

            functionPattern.setRegion(
                dimension - 11,
                0,
                3,
                6
            );


            functionPattern.setRegion(
                0,
                dimension - 11,
                6,
                3
            );
        }


        return functionPattern;
    }


    /**
     * Append one matrix bit to an integer.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} bits
     *
     * @returns {number}
     */
    copyBit(
        x,
        y,
        bits
    ) {

        return (
            (
                bits <<
                1
            ) |
            (
                this.bitMatrix.get(
                    x,
                    y
                )
                    ? 1
                    : 0
            )
        );
    }


    /**
     * Extract data-mask number.
     *
     * @param {*} formatInfo
     *
     * @returns {number}
     */
    getDataMask(formatInfo) {

        let mask;


        if (
            formatInfo &&
            typeof formatInfo
                .getDataMask ===
            "function"
        ) {

            mask =
                formatInfo
                    .getDataMask();

        } else if (
            formatInfo &&
            Number.isInteger(
                formatInfo.dataMask
            )
        ) {

            mask =
                formatInfo.dataMask;

        } else if (
            formatInfo &&
            Number.isInteger(
                formatInfo.dataMaskReference
            )
        ) {

            mask =
                formatInfo
                    .dataMaskReference;

        } else {

            throw new Error(
                "QRFormatInformation does not expose a data mask."
            );
        }


        if (
            !Number.isInteger(mask) ||
            mask < 0 ||
            mask > 7
        ) {

            throw new Error(
                `Invalid QR data mask: ${mask}`
            );
        }


        return mask;
    }


    /**
     * Resolve a QRVersion.
     *
     * @param {number} versionNumber
     *
     * @returns {QRVersion}
     */
    getVersionForNumber(
        versionNumber
    ) {

        if (
            typeof QRVersion ===
            "undefined"
        ) {

            throw new Error(
                "QRVersion.js must be loaded before QRBitMatrixParser."
            );
        }


        if (
            typeof QRVersion
                .getVersionForNumber ===
            "function"
        ) {

            return QRVersion
                .getVersionForNumber(
                    versionNumber
                );
        }


        if (
            typeof QRVersion
                .getVersion ===
            "function"
        ) {

            return QRVersion
                .getVersion(
                    versionNumber
                );
        }


        return new QRVersion(
            versionNumber
        );
    }


    /**
     * Decode explicit version bits.
     *
     * @param {number} versionBits
     *
     * @returns {QRVersion|null}
     */
    decodeVersionInformation(
        versionBits
    ) {

        if (
            typeof QRVersion ===
            "undefined"
        ) {

            throw new Error(
                "QRVersion.js must be loaded before QRBitMatrixParser."
            );
        }


        if (
            typeof QRVersion
                .decodeVersionInformation ===
            "function"
        ) {

            return QRVersion
                .decodeVersionInformation(
                    versionBits
                );
        }


        if (
            typeof QRVersion.decode ===
            "function"
        ) {

            return QRVersion.decode(
                versionBits
            );
        }


        throw new Error(
            "QRVersion must provide decodeVersionInformation()."
        );
    }


    /**
     * @param {QRVersion|number} version
     *
     * @returns {number}
     */
    getVersionNumber(version) {

        if (Number.isInteger(version)) {
            return version;
        }


        if (
            version &&
            typeof version
                .getVersionNumber ===
            "function"
        ) {

            return version
                .getVersionNumber();
        }


        if (
            version &&
            Number.isInteger(
                version.versionNumber
            )
        ) {

            return version.versionNumber;
        }


        if (
            version &&
            Number.isInteger(
                version.version
            )
        ) {

            return version.version;
        }


        throw new Error(
            "Unable to determine QR version number."
        );
    }


    /**
     * @param {QRVersion|number} version
     *
     * @returns {number}
     */
    getDimensionForVersion(version) {

        if (
            version &&
            typeof version
                .getDimensionForVersion ===
            "function"
        ) {

            return version
                .getDimensionForVersion();
        }


        if (
            version &&
            Number.isInteger(
                version.dimension
            )
        ) {

            return version.dimension;
        }


        return (
            17 +
            4 *
            this.getVersionNumber(
                version
            )
        );
    }


    /**
     * @param {QRVersion} version
     *
     * @returns {number}
     */
    getTotalCodewords(version) {

        let total;


        if (
            version &&
            typeof version
                .getTotalCodewords ===
            "function"
        ) {

            total =
                version
                    .getTotalCodewords();

        } else if (
            version &&
            Number.isInteger(
                version.totalCodewords
            )
        ) {

            total =
                version.totalCodewords;

        } else {

            throw new Error(
                "QRVersion does not expose totalCodewords."
            );
        }


        if (
            !Number.isInteger(total) ||
            total <= 0
        ) {

            throw new Error(
                "QRVersion contains an invalid total codeword count."
            );
        }


        return total;
    }


    /**
     * Obtain alignment-pattern centres.
     *
     * @param {*} version
     * @param {number} versionNumber
     *
     * @returns {number[]}
     */
    getAlignmentPatternCenters(
        version,
        versionNumber
    ) {

        if (versionNumber === 1) {
            return [];
        }


        if (
            version &&
            typeof version
                .getAlignmentPatternCenters ===
            "function"
        ) {

            return Array.from(
                version
                    .getAlignmentPatternCenters()
            );
        }


        if (
            version &&
            version.alignmentPatternCenters &&
            (
                Array.isArray(
                    version
                        .alignmentPatternCenters
                ) ||
                ArrayBuffer.isView(
                    version
                        .alignmentPatternCenters
                )
            )
        ) {

            return Array.from(
                version
                    .alignmentPatternCenters
            );
        }


        return this
            .calculateAlignmentPatternCenters(
                versionNumber
            );
    }


    /**
     * Calculate QR alignment-pattern centres.
     *
     * @param {number} version
     *
     * @returns {number[]}
     */
    calculateAlignmentPatternCenters(
        version
    ) {

        if (version === 1) {
            return [];
        }


        const numberOfCenters =
            Math.floor(
                version /
                7
            ) +
            2;


        const dimension =
            17 +
            4 *
            version;


        let step;


        /*
         * QR Version 32 is the one special spacing case.
         */
        if (version === 32) {

            step = 26;

        } else {

            step =
                Math.ceil(
                    (
                        dimension -
                        13
                    ) /
                    (
                        2 *
                        numberOfCenters -
                        2
                    )
                ) *
                2;
        }


        const result =
            new Array(
                numberOfCenters
            );


        result[0] = 6;


        for (
            let i =
                numberOfCenters - 1;
            i >= 1;
            i--
        ) {

            result[i] =
                dimension -
                7 -
                (
                    (
                        numberOfCenters -
                        1 -
                        i
                    ) *
                    step
                );
        }


        return result;
    }


    /**
     * @returns {number}
     */
    getDimension() {

        return this.dimension;
    }


    /**
     * @returns {BitMatrix}
     */
    getBitMatrix() {

        return this.bitMatrix;
    }


    /**
     * Clear cached structural information.
     */
    resetCache() {

        this.parsedVersion = null;
        this.parsedFormatInfo = null;
    }
}