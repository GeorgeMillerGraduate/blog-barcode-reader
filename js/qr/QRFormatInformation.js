/**
 * QRFormatInformation
 *
 * Decodes the 15-bit QR format-information field.
 *
 * Format information contains:
 *
 * - 2 bits: error-correction level
 * - 3 bits: data-mask pattern
 * - 10 bits: BCH error correction
 *
 * QR format information is XOR-masked with 0x5412.
 *
 * The information is stored twice in a QR symbol.
 *
 * Compatible with QRBitMatrixParser.js and QRCodeReader.js.
 */
class QRFormatInformation {

    /**
     * QR format-information mask.
     */
    static FORMAT_INFO_MASK_QR = 0x5412;


    /**
     * Maximum Hamming distance accepted when recovering
     * damaged format information.
     *
     * The BCH(15,5) format code can correct up to 3 bits.
     */
    static MAX_FORMAT_ERRORS = 3;


    /**
     * Lookup table:
     *
     * [masked 15-bit format pattern, 5-bit format data]
     *
     * The five data bits contain:
     *
     * bits 4-3 = error-correction level
     * bits 2-0 = data-mask pattern
     */
    static FORMAT_INFO_DECODE_LOOKUP = [

        [0x5412, 0x00],
        [0x5125, 0x01],
        [0x5E7C, 0x02],
        [0x5B4B, 0x03],
        [0x45F9, 0x04],
        [0x40CE, 0x05],
        [0x4F97, 0x06],
        [0x4AA0, 0x07],

        [0x77C4, 0x08],
        [0x72F3, 0x09],
        [0x7DAA, 0x0A],
        [0x789D, 0x0B],
        [0x662F, 0x0C],
        [0x6318, 0x0D],
        [0x6C41, 0x0E],
        [0x6976, 0x0F],

        [0x1689, 0x10],
        [0x13BE, 0x11],
        [0x1CE7, 0x12],
        [0x19D0, 0x13],
        [0x0762, 0x14],
        [0x0255, 0x15],
        [0x0D0C, 0x16],
        [0x083B, 0x17],

        [0x355F, 0x18],
        [0x3068, 0x19],
        [0x3F31, 0x1A],
        [0x3A06, 0x1B],
        [0x24B4, 0x1C],
        [0x2183, 0x1D],
        [0x2EDA, 0x1E],
        [0x2BED, 0x1F]
    ];


    /**
     * @param {number} formatInfo
     *
     * formatInfo is the decoded five-bit format value.
     */
    constructor(formatInfo) {

        if (
            !Number.isInteger(formatInfo) ||
            formatInfo < 0 ||
            formatInfo > 0x1F
        ) {
            throw new RangeError(
                `Invalid QR format information: ${formatInfo}`
            );
        }


        this.formatInfo =
            formatInfo;


        /*
         * Bottom three bits specify the mask.
         */
        this.dataMask =
            formatInfo &
            0x07;


        /*
         * Top two bits specify the EC level.
         */
        this.errorCorrectionBits =
            (
                formatInfo >>
                3
            ) &
            0x03;


        this.errorCorrectionLevel =
            QRFormatInformation
                .decodeErrorCorrectionLevel(
                    this.errorCorrectionBits
                );
    }


    /**
     * Decodes either of the two copies of QR format
     * information.
     *
     * If neither copy is exact, the nearest valid BCH
     * pattern is accepted when its Hamming distance is <= 3.
     *
     * @param {number} maskedFormatInfo1
     * @param {number} maskedFormatInfo2
     *
     * @returns {QRFormatInformation|null}
     */
    static decodeFormatInformation(
        maskedFormatInfo1,
        maskedFormatInfo2 = maskedFormatInfo1
    ) {

        QRFormatInformation
            .validateFormatBits(
                maskedFormatInfo1
            );


        QRFormatInformation
            .validateFormatBits(
                maskedFormatInfo2
            );


        /*
         * Normal case:
         *
         * The bits read directly from the QR symbol still
         * contain the QR format mask 0x5412.
         */
        let result =
            QRFormatInformation
                .doDecodeFormatInformation(
                    maskedFormatInfo1,
                    maskedFormatInfo2
                );


        if (result !== null) {
            return result;
        }


        /*
         * Some inputs may already have had the fixed QR
         * format mask removed.
         *
         * ZXing performs this second attempt as a fallback.
         */
        result =
            QRFormatInformation
                .doDecodeFormatInformation(
                    maskedFormatInfo1 ^
                        QRFormatInformation
                            .FORMAT_INFO_MASK_QR,

                    maskedFormatInfo2 ^
                        QRFormatInformation
                            .FORMAT_INFO_MASK_QR
                );


        return result;
    }


    /**
     * Short alias used by QRBitMatrixParser when desired.
     *
     * @param {number} maskedFormatInfo1
     * @param {number} maskedFormatInfo2
     *
     * @returns {QRFormatInformation|null}
     */
    static decode(
        maskedFormatInfo1,
        maskedFormatInfo2 = maskedFormatInfo1
    ) {

        return QRFormatInformation
            .decodeFormatInformation(
                maskedFormatInfo1,
                maskedFormatInfo2
            );
    }


    /**
     * Internal format-information decoder.
     *
     * @param {number} maskedFormatInfo1
     * @param {number} maskedFormatInfo2
     *
     * @returns {QRFormatInformation|null}
     */
    static doDecodeFormatInformation(
        maskedFormatInfo1,
        maskedFormatInfo2
    ) {

        let bestDifference =
            Number.POSITIVE_INFINITY;


        let bestFormatInfo = 0;


        const lookup =
            QRFormatInformation
                .FORMAT_INFO_DECODE_LOOKUP;


        for (
            let i = 0;
            i < lookup.length;
            i++
        ) {

            const targetInfo =
                lookup[i][0];


            const formatInfo =
                lookup[i][1];


            /*
             * Exact match with the first copy.
             */
            if (
                targetInfo ===
                maskedFormatInfo1
            ) {

                return new QRFormatInformation(
                    formatInfo
                );
            }


            /*
             * Hamming distance from first copy.
             */
            let bitsDifference =
                QRFormatInformation
                    .numBitsDiffering(
                        maskedFormatInfo1,
                        targetInfo
                    );


            if (
                bitsDifference <
                bestDifference
            ) {

                bestDifference =
                    bitsDifference;

                bestFormatInfo =
                    formatInfo;
            }


            /*
             * If both copies are identical there is no
             * reason to calculate the distance twice.
             */
            if (
                maskedFormatInfo1 !==
                maskedFormatInfo2
            ) {

                /*
                 * Exact match with the second copy.
                 */
                if (
                    targetInfo ===
                    maskedFormatInfo2
                ) {

                    return new QRFormatInformation(
                        formatInfo
                    );
                }


                bitsDifference =
                    QRFormatInformation
                        .numBitsDiffering(
                            maskedFormatInfo2,
                            targetInfo
                        );


                if (
                    bitsDifference <
                    bestDifference
                ) {

                    bestDifference =
                        bitsDifference;

                    bestFormatInfo =
                        formatInfo;
                }
            }
        }


        /*
         * BCH(15,5) format information has minimum
         * Hamming distance 7 and can therefore correct
         * up to three erroneous bits.
         */
        if (
            bestDifference <=
            QRFormatInformation
                .MAX_FORMAT_ERRORS
        ) {

            return new QRFormatInformation(
                bestFormatInfo
            );
        }


        return null;
    }


    /**
     * Converts the two QR error-correction bits to their
     * logical level.
     *
     * QR uses the following bit mapping:
     *
     * 01 = L
     * 00 = M
     * 11 = Q
     * 10 = H
     *
     * @param {number} bits
     *
     * @returns {string}
     */
    static decodeErrorCorrectionLevel(
        bits
    ) {

        switch (bits) {

            case 0x01:
                return "L";

            case 0x00:
                return "M";

            case 0x03:
                return "Q";

            case 0x02:
                return "H";

            default:

                throw new Error(
                    `Invalid QR error correction bits: ${bits}`
                );
        }
    }


    /**
     * Converts an EC level name back into its two format
     * bits.
     *
     * @param {string} level
     *
     * @returns {number}
     */
    static encodeErrorCorrectionLevel(
        level
    ) {

        if (
            typeof level !==
            "string"
        ) {
            throw new TypeError(
                "QR error correction level must be a string."
            );
        }


        switch (
            level.toUpperCase()
        ) {

            case "L":
                return 0x01;

            case "M":
                return 0x00;

            case "Q":
                return 0x03;

            case "H":
                return 0x02;

            default:

                throw new Error(
                    `Unknown QR error correction level: ${level}`
                );
        }
    }


    /**
     * Counts differing bits between two integers.
     *
     * Used to recover format information containing up to
     * three damaged bits.
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


        /*
         * Kernighan population-count algorithm.
         */
        let count = 0;


        while (value !== 0) {

            value =
                (
                    value &
                    (
                        value -
                        1
                    )
                ) >>>
                0;


            count++;
        }


        return count;
    }


    /**
     * Validates a raw 15-bit format-information value.
     *
     * @param {number} value
     */
    static validateFormatBits(
        value
    ) {

        if (
            !Number.isInteger(value) ||
            value < 0 ||
            value > 0x7FFF
        ) {
            throw new RangeError(
                `QR format information must be a 15-bit value: ${value}`
            );
        }
    }


    /**
     * Returns the QR error-correction level.
     *
     * Compatible with QRCodeReader.
     *
     * @returns {"L"|"M"|"Q"|"H"}
     */
    getErrorCorrectionLevel() {

        return this.errorCorrectionLevel;
    }


    /**
     * Alias for the EC level.
     *
     * @returns {"L"|"M"|"Q"|"H"}
     */
    getECLevel() {

        return this.errorCorrectionLevel;
    }


    /**
     * Returns the three-bit data-mask number.
     *
     * Range:
     *
     * 0-7
     *
     * @returns {number}
     */
    getDataMask() {

        return this.dataMask;
    }


    /**
     * Alias matching some QR implementations.
     *
     * @returns {number}
     */
    getDataMaskReference() {

        return this.dataMask;
    }


    /**
     * Returns the original decoded five information bits.
     *
     * @returns {number}
     */
    getFormatInfo() {

        return this.formatInfo;
    }


    /**
     * Returns the raw two EC-level bits.
     *
     * @returns {number}
     */
    getErrorCorrectionBits() {

        return this.errorCorrectionBits;
    }


    /**
     * Compares two decoded format-information objects.
     *
     * @param {*} other
     *
     * @returns {boolean}
     */
    equals(other) {

        return (
            other instanceof
                QRFormatInformation &&
            this.formatInfo ===
                other.formatInfo
        );
    }


    /**
     * Returns a numeric hash value.
     *
     * @returns {number}
     */
    hashCode() {

        return this.formatInfo;
    }


    /**
     * Returns a debug-friendly object.
     *
     * @returns {Object}
     */
    toObject() {

        return {

            errorCorrectionLevel:
                this.errorCorrectionLevel,

            errorCorrectionBits:
                this.errorCorrectionBits,

            dataMask:
                this.dataMask,

            formatInfo:
                this.formatInfo
        };
    }


    /**
     * Returns a readable representation.
     *
     * @returns {string}
     */
    toString() {

        return (
            "QRFormatInformation(" +
            `EC=${this.errorCorrectionLevel}, ` +
            `mask=${this.dataMask}` +
            ")"
        );
    }
}