/**
 * QRDecodedBitStreamParser
 *
 * Converts corrected QR data codewords into the original
 * payload.
 *
 * Supported QR modes:
 *
 * - Terminator
 * - Numeric
 * - Alphanumeric
 * - Structured Append
 * - Byte
 * - FNC1 First Position
 * - ECI
 * - Kanji
 * - FNC1 Second Position
 * - Hanzi
 *
 * Requires:
 *
 * - BitSource.js
 * - QRVersion.js
 *
 * This class deliberately has no module export so it can be
 * loaded directly with <script> tags alongside the other
 * scanner classes.
 */
class QRDecodedBitStreamParser {

    /*
     * QR alphanumeric character table.
     */
    static ALPHANUMERIC_CHARS =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";


    /*
     * QR mode indicators.
     */
    static MODE_TERMINATOR = 0x0;
    static MODE_NUMERIC = 0x1;
    static MODE_ALPHANUMERIC = 0x2;
    static MODE_STRUCTURED_APPEND = 0x3;
    static MODE_BYTE = 0x4;
    static MODE_FNC1_FIRST_POSITION = 0x5;
    static MODE_ECI = 0x7;
    static MODE_KANJI = 0x8;
    static MODE_FNC1_SECOND_POSITION = 0x9;
    static MODE_HANZI = 0xD;


    /**
     * Decodes corrected QR payload bytes.
     *
     * @param {Array<number>|Uint8Array|Int32Array} bytes
     * @param {*} version
     * @param {*} errorCorrectionLevel
     *
     * @returns {{
     *     text:string,
     *     rawBytes:Uint8Array,
     *     byteSegments:Uint8Array[],
     *     errorCorrectionLevel:*,
     *     structuredAppendSequence:number|null,
     *     structuredAppendParity:number|null,
     *     symbologyModifier:number
     * }}
     */
    static decode(
        bytes,
        version,
        errorCorrectionLevel = null
    ) {

        if (
            !bytes ||
            typeof bytes.length !==
                "number"
        ) {
            throw new TypeError(
                "QRDecodedBitStreamParser.decode requires a byte array."
            );
        }


        const input =
            bytes instanceof Uint8Array
                ? bytes
                : Uint8Array.from(
                    bytes,
                    value => value & 0xFF
                );


        const bits =
            new BitSource(input);


        const result = [];

        const byteSegments = [];


        let currentECI = null;

        let fc1InEffect = false;

        let fnc1SecondPosition = false;

        let structuredAppendSequence =
            null;

        let structuredAppendParity =
            null;


        /*
         * -------------------------------------------------
         * READ MODE SEGMENTS
         * -------------------------------------------------
         */
        while (true) {

            let mode;


            /*
             * Fewer than four bits means there is no room
             * for another mode indicator. Treat it as the
             * terminator.
             */
            if (bits.available() < 4) {

                mode =
                    QRDecodedBitStreamParser
                        .MODE_TERMINATOR;

            } else {

                mode =
                    bits.readBits(4);
            }


            if (
                mode ===
                QRDecodedBitStreamParser
                    .MODE_TERMINATOR
            ) {
                break;
            }


            switch (mode) {

                /*
                 * -----------------------------------------
                 * FNC1 FIRST POSITION
                 * -----------------------------------------
                 */
                case QRDecodedBitStreamParser
                    .MODE_FNC1_FIRST_POSITION:

                    fc1InEffect = true;

                    break;


                /*
                 * -----------------------------------------
                 * FNC1 SECOND POSITION
                 * -----------------------------------------
                 */
                case QRDecodedBitStreamParser
                    .MODE_FNC1_SECOND_POSITION:

                    fc1InEffect = true;

                    fnc1SecondPosition = true;

                    break;


                /*
                 * -----------------------------------------
                 * STRUCTURED APPEND
                 *
                 * 8 bits sequence
                 * 8 bits parity
                 * -----------------------------------------
                 */
                case QRDecodedBitStreamParser
                    .MODE_STRUCTURED_APPEND:

                    if (
                        bits.available() <
                        16
                    ) {
                        throw new Error(
                            "Invalid QR structured append segment."
                        );
                    }


                    structuredAppendSequence =
                        bits.readBits(8);


                    structuredAppendParity =
                        bits.readBits(8);

                    break;


                /*
                 * -----------------------------------------
                 * ECI
                 * -----------------------------------------
                 */
                case QRDecodedBitStreamParser
                    .MODE_ECI:

                    currentECI =
                        QRDecodedBitStreamParser
                            .parseECIValue(
                                bits
                            );

                    break;


                /*
                 * -----------------------------------------
                 * HANZI
                 *
                 * Hanzi contains a four-bit subset
                 * indicator before its character count.
                 * -----------------------------------------
                 */
                case QRDecodedBitStreamParser
                    .MODE_HANZI: {

                    if (
                        bits.available() <
                        4
                    ) {
                        throw new Error(
                            "Invalid QR Hanzi segment."
                        );
                    }


                    const subset =
                        bits.readBits(4);


                    const countBits =
                        QRDecodedBitStreamParser
                            .getCharacterCountBits(
                                mode,
                                version
                            );


                    if (
                        bits.available() <
                        countBits
                    ) {
                        throw new Error(
                            "Invalid QR Hanzi character count."
                        );
                    }


                    const count =
                        bits.readBits(
                            countBits
                        );


                    /*
                     * Subset 1 represents GB2312.
                     */
                    if (subset === 1) {

                        result.push(
                            QRDecodedBitStreamParser
                                .decodeHanziSegment(
                                    bits,
                                    count
                                )
                        );

                    } else {

                        throw new Error(
                            `Unsupported QR Hanzi subset: ${subset}`
                        );
                    }

                    break;
                }


                /*
                 * -----------------------------------------
                 * DATA MODES
                 * -----------------------------------------
                 */
                case QRDecodedBitStreamParser
                    .MODE_NUMERIC:

                case QRDecodedBitStreamParser
                    .MODE_ALPHANUMERIC:

                case QRDecodedBitStreamParser
                    .MODE_BYTE:

                case QRDecodedBitStreamParser
                    .MODE_KANJI: {

                    const countBits =
                        QRDecodedBitStreamParser
                            .getCharacterCountBits(
                                mode,
                                version
                            );


                    if (
                        bits.available() <
                        countBits
                    ) {
                        throw new Error(
                            "QR payload ended before the character count."
                        );
                    }


                    const count =
                        bits.readBits(
                            countBits
                        );


                    switch (mode) {

                        case QRDecodedBitStreamParser
                            .MODE_NUMERIC:

                            result.push(
                                QRDecodedBitStreamParser
                                    .decodeNumericSegment(
                                        bits,
                                        count
                                    )
                            );

                            break;


                        case QRDecodedBitStreamParser
                            .MODE_ALPHANUMERIC:

                            result.push(
                                QRDecodedBitStreamParser
                                    .decodeAlphanumericSegment(
                                        bits,
                                        count,
                                        fc1InEffect
                                    )
                            );

                            break;


                        case QRDecodedBitStreamParser
                            .MODE_BYTE: {

                            const segment =
                                QRDecodedBitStreamParser
                                    .decodeByteSegment(
                                        bits,
                                        count,
                                        currentECI
                                    );


                            byteSegments.push(
                                segment.bytes
                            );


                            result.push(
                                segment.text
                            );

                            break;
                        }


                        case QRDecodedBitStreamParser
                            .MODE_KANJI:

                            result.push(
                                QRDecodedBitStreamParser
                                    .decodeKanjiSegment(
                                        bits,
                                        count
                                    )
                            );

                            break;
                    }

                    break;
                }


                default:

                    throw new Error(
                        `Unsupported QR mode: 0x${mode.toString(16).toUpperCase()}`
                    );
            }
        }


        /*
         * ZXing-style symbology modifier.
         *
         * 1 = ordinary QR
         * 2 = ECI QR
         * 3 = FNC1 first position
         * 4 = FNC1 first + ECI
         * 5 = FNC1 second position
         * 6 = FNC1 second + ECI
         */
        let symbologyModifier;


        if (fc1InEffect) {

            if (fnc1SecondPosition) {

                symbologyModifier =
                    currentECI === null
                        ? 5
                        : 6;

            } else {

                symbologyModifier =
                    currentECI === null
                        ? 3
                        : 4;
            }

        } else {

            symbologyModifier =
                currentECI === null
                    ? 1
                    : 2;
        }


        return {

            text:
                result.join(""),

            rawBytes:
                input,

            byteSegments:
                byteSegments,

            errorCorrectionLevel:
                errorCorrectionLevel,

            structuredAppendSequence:
                structuredAppendSequence,

            structuredAppendParity:
                structuredAppendParity,

            symbologyModifier:
                symbologyModifier
        };
    }


    /**
     * Decodes a numeric-mode segment.
     *
     * Encoding:
     *
     * 3 digits -> 10 bits
     * 2 digits -> 7 bits
     * 1 digit  -> 4 bits
     *
     * @param {BitSource} bits
     * @param {number} count
     *
     * @returns {string}
     */
    static decodeNumericSegment(
        bits,
        count
    ) {

        let result = "";


        while (count >= 3) {

            if (
                bits.available() <
                10
            ) {
                throw new Error(
                    "Invalid QR numeric segment."
                );
            }


            const value =
                bits.readBits(10);


            if (value >= 1000) {
                throw new Error(
                    "Invalid three-digit QR numeric value."
                );
            }


            result +=
                String.fromCharCode(
                    48 +
                    Math.floor(
                        value / 100
                    )
                );


            result +=
                String.fromCharCode(
                    48 +
                    Math.floor(
                        value / 10
                    ) %
                    10
                );


            result +=
                String.fromCharCode(
                    48 +
                    (
                        value %
                        10
                    )
                );


            count -= 3;
        }


        if (count === 2) {

            if (
                bits.available() <
                7
            ) {
                throw new Error(
                    "Invalid QR numeric segment."
                );
            }


            const value =
                bits.readBits(7);


            if (value >= 100) {
                throw new Error(
                    "Invalid two-digit QR numeric value."
                );
            }


            result +=
                String.fromCharCode(
                    48 +
                    Math.floor(
                        value / 10
                    )
                );


            result +=
                String.fromCharCode(
                    48 +
                    (
                        value %
                        10
                    )
                );

        } else if (
            count === 1
        ) {

            if (
                bits.available() <
                4
            ) {
                throw new Error(
                    "Invalid QR numeric segment."
                );
            }


            const value =
                bits.readBits(4);


            if (value >= 10) {
                throw new Error(
                    "Invalid one-digit QR numeric value."
                );
            }


            result +=
                String.fromCharCode(
                    48 + value
                );
        }


        return result;
    }


    /**
     * Decodes an alphanumeric-mode segment.
     *
     * Two characters are stored in 11 bits:
     *
     * value = first * 45 + second
     *
     * A final single character uses 6 bits.
     *
     * @param {BitSource} bits
     * @param {number} count
     * @param {boolean} fc1InEffect
     *
     * @returns {string}
     */
    static decodeAlphanumericSegment(
        bits,
        count,
        fc1InEffect = false
    ) {

        let result = "";


        while (count > 1) {

            if (
                bits.available() <
                11
            ) {
                throw new Error(
                    "Invalid QR alphanumeric segment."
                );
            }


            const value =
                bits.readBits(11);


            const first =
                Math.floor(
                    value / 45
                );


            const second =
                value % 45;


            result +=
                QRDecodedBitStreamParser
                    .toAlphanumericChar(
                        first
                    );


            result +=
                QRDecodedBitStreamParser
                    .toAlphanumericChar(
                        second
                    );


            count -= 2;
        }


        if (count === 1) {

            if (
                bits.available() <
                6
            ) {
                throw new Error(
                    "Invalid QR alphanumeric segment."
                );
            }


            result +=
                QRDecodedBitStreamParser
                    .toAlphanumericChar(
                        bits.readBits(6)
                    );
        }


        /*
         * FNC1 modifies '%' handling:
         *
         * %% -> %
         * %  -> ASCII Group Separator (0x1D)
         */
        if (fc1InEffect) {

            let transformed = "";


            for (
                let i = 0;
                i < result.length;
                i++
            ) {

                const character =
                    result[i];


                if (
                    character !== "%"
                ) {

                    transformed +=
                        character;

                    continue;
                }


                if (
                    i + 1 <
                        result.length &&
                    result[
                        i + 1
                    ] === "%"
                ) {

                    transformed += "%";

                    i++;

                } else {

                    transformed +=
                        "\x1D";
                }
            }


            result =
                transformed;
        }


        return result;
    }


    /**
     * Decodes byte mode.
     *
     * ECI is used to determine the text character set when
     * present. Without ECI, UTF-8 is attempted first.
     *
     * @param {BitSource} bits
     * @param {number} count
     * @param {number|null} eciValue
     *
     * @returns {{
     *     text:string,
     *     bytes:Uint8Array
     * }}
     */
    static decodeByteSegment(
        bits,
        count,
        eciValue = null
    ) {

        if (
            count < 0 ||
            bits.available() <
                count * 8
        ) {
            throw new Error(
                "Invalid QR byte segment."
            );
        }


        const segmentBytes =
            new Uint8Array(
                count
            );


        for (
            let i = 0;
            i < count;
            i++
        ) {

            segmentBytes[i] =
                bits.readBits(8);
        }


        const encoding =
            QRDecodedBitStreamParser
                .getEncodingForECI(
                    eciValue
                );


        const text =
            QRDecodedBitStreamParser
                .decodeBytes(
                    segmentBytes,
                    encoding
                );


        return {
            text: text,
            bytes: segmentBytes
        };
    }


    /**
     * Decodes QR Kanji mode.
     *
     * Each character occupies 13 bits and is transformed
     * into a Shift-JIS double-byte sequence.
     *
     * @param {BitSource} bits
     * @param {number} count
     *
     * @returns {string}
     */
    static decodeKanjiSegment(
        bits,
        count
    ) {

        if (
            bits.available() <
            count * 13
        ) {
            throw new Error(
                "Invalid QR Kanji segment."
            );
        }


        const buffer =
            new Uint8Array(
                count * 2
            );


        let offset = 0;


        while (count > 0) {

            const twoBytes =
                bits.readBits(13);


            let assembled =
                (
                    Math.floor(
                        twoBytes /
                        0x0C0
                    ) <<
                    8
                ) |
                (
                    twoBytes %
                    0x0C0
                );


            if (
                assembled <
                0x01F00
            ) {

                assembled +=
                    0x08140;

            } else {

                assembled +=
                    0x0C140;
            }


            buffer[offset++] =
                (
                    assembled >>
                    8
                ) &
                0xFF;


            buffer[offset++] =
                assembled &
                0xFF;


            count--;
        }


        return QRDecodedBitStreamParser
            .decodeBytes(
                buffer,
                "shift_jis"
            );
    }


    /**
     * Decodes QR Hanzi subset 1 (GB2312).
     *
     * @param {BitSource} bits
     * @param {number} count
     *
     * @returns {string}
     */
    static decodeHanziSegment(
        bits,
        count
    ) {

        if (
            bits.available() <
            count * 13
        ) {
            throw new Error(
                "Invalid QR Hanzi segment."
            );
        }


        const buffer =
            new Uint8Array(
                count * 2
            );


        let offset = 0;


        while (count > 0) {

            const twoBytes =
                bits.readBits(13);


            let assembled =
                (
                    Math.floor(
                        twoBytes /
                        0x060
                    ) <<
                    8
                ) |
                (
                    twoBytes %
                    0x060
                );


            if (
                assembled <
                0x003BF
            ) {

                assembled +=
                    0x0A1A1;

            } else {

                assembled +=
                    0x0A6A1;
            }


            buffer[offset++] =
                (
                    assembled >>
                    8
                ) &
                0xFF;


            buffer[offset++] =
                assembled &
                0xFF;


            count--;
        }


        return QRDecodedBitStreamParser
            .decodeBytes(
                buffer,
                "gb2312"
            );
    }


    /**
     * Reads a QR ECI assignment number.
     *
     * ECI values use one, two or three bytes depending on
     * their leading bits.
     *
     * @param {BitSource} bits
     * @returns {number}
     */
    static parseECIValue(bits) {

        if (
            bits.available() <
            8
        ) {
            throw new Error(
                "Invalid QR ECI segment."
            );
        }


        const firstByte =
            bits.readBits(8);


        /*
         * 0xxxxxxx
         *
         * One-byte ECI.
         */
        if (
            (
                firstByte &
                0x80
            ) === 0
        ) {

            return (
                firstByte &
                0x7F
            );
        }


        /*
         * 10xxxxxx xxxxxxxx
         *
         * Two-byte ECI.
         */
        if (
            (
                firstByte &
                0xC0
            ) ===
            0x80
        ) {

            if (
                bits.available() <
                8
            ) {
                throw new Error(
                    "Invalid two-byte QR ECI value."
                );
            }


            return (
                (
                    firstByte &
                    0x3F
                ) <<
                8
            ) |
            bits.readBits(8);
        }


        /*
         * 110xxxxx xxxxxxxx xxxxxxxx
         *
         * Three-byte ECI.
         */
        if (
            (
                firstByte &
                0xE0
            ) ===
            0xC0
        ) {

            if (
                bits.available() <
                16
            ) {
                throw new Error(
                    "Invalid three-byte QR ECI value."
                );
            }


            return (
                (
                    firstByte &
                    0x1F
                ) <<
                16
            ) |
            bits.readBits(16);
        }


        throw new Error(
            "Invalid QR ECI designator."
        );
    }


    /**
     * Returns the number of character-count bits for a
     * mode and QR version.
     *
     * Version groups:
     *
     * 1-9
     * 10-26
     * 27-40
     *
     * @param {number} mode
     * @param {*} version
     *
     * @returns {number}
     */
    static getCharacterCountBits(
        mode,
        version
    ) {

        const versionNumber =
            QRDecodedBitStreamParser
                .getVersionNumber(
                    version
                );


        let offset;


        if (versionNumber <= 9) {

            offset = 0;

        } else if (
            versionNumber <= 26
        ) {

            offset = 1;

        } else {

            offset = 2;
        }


        /*
         * Values defined by ISO/IEC 18004.
         */
        switch (mode) {

            case QRDecodedBitStreamParser
                .MODE_NUMERIC:

                return [
                    10,
                    12,
                    14
                ][offset];


            case QRDecodedBitStreamParser
                .MODE_ALPHANUMERIC:

                return [
                    9,
                    11,
                    13
                ][offset];


            case QRDecodedBitStreamParser
                .MODE_BYTE:

                return [
                    8,
                    16,
                    16
                ][offset];


            case QRDecodedBitStreamParser
                .MODE_KANJI:

            case QRDecodedBitStreamParser
                .MODE_HANZI:

                return [
                    8,
                    10,
                    12
                ][offset];


            default:

                throw new Error(
                    `QR mode ${mode} does not have a character-count field.`
                );
        }
    }


    /**
     * Returns the QR version number.
     *
     * @param {*} version
     * @returns {number}
     */
    static getVersionNumber(
        version
    ) {

        let value;


        if (
            Number.isInteger(
                version
            )
        ) {

            value =
                version;

        } else if (
            version &&
            typeof version
                .getVersionNumber ===
            "function"
        ) {

            value =
                version
                    .getVersionNumber();

        } else if (
            version &&
            Number.isInteger(
                version.versionNumber
            )
        ) {

            value =
                version.versionNumber;

        } else if (
            version &&
            Number.isInteger(
                version.version
            )
        ) {

            value =
                version.version;

        } else {

            throw new Error(
                "Unable to determine QR version number."
            );
        }


        if (
            value < 1 ||
            value > 40
        ) {
            throw new RangeError(
                `Invalid QR version: ${value}`
            );
        }


        return value;
    }


    /**
     * Converts an alphanumeric table index to a character.
     *
     * @param {number} value
     * @returns {string}
     */
    static toAlphanumericChar(
        value
    ) {

        if (
            !Number.isInteger(value) ||
            value < 0 ||
            value >=
                QRDecodedBitStreamParser
                    .ALPHANUMERIC_CHARS
                    .length
        ) {
            throw new Error(
                `Invalid QR alphanumeric value: ${value}`
            );
        }


        return QRDecodedBitStreamParser
            .ALPHANUMERIC_CHARS[
                value
            ];
    }


    /**
     * Maps common ECI assignment numbers to encodings
     * understood by TextDecoder.
     *
     * @param {number|null} eci
     * @returns {string|null}
     */
    static getEncodingForECI(
        eci
    ) {

        if (
            eci === null ||
            eci === undefined
        ) {
            return null;
        }


        switch (eci) {

            /*
             * CP437
             */
            case 0:
            case 2:
                return "ibm437";


            /*
             * ISO-8859-1
             */
            case 1:
            case 3:
                return "iso-8859-1";


            case 4:
                return "iso-8859-2";

            case 5:
                return "iso-8859-3";

            case 6:
                return "iso-8859-4";

            case 7:
                return "iso-8859-5";

            case 8:
                return "iso-8859-6";

            case 9:
                return "iso-8859-7";

            case 10:
                return "iso-8859-8";

            case 11:
                return "iso-8859-9";

            case 12:
                return "iso-8859-10";

            case 13:
                return "iso-8859-11";

            case 15:
                return "iso-8859-13";

            case 16:
                return "iso-8859-14";

            case 17:
                return "iso-8859-15";

            case 18:
                return "iso-8859-16";


            /*
             * Shift JIS
             */
            case 20:
                return "shift_jis";


            /*
             * Windows-1250
             */
            case 21:
                return "windows-1250";


            /*
             * Windows-1251
             */
            case 22:
                return "windows-1251";


            /*
             * Windows-1252
             */
            case 23:
                return "windows-1252";


            /*
             * Windows-1256
             */
            case 24:
                return "windows-1256";


            /*
             * UTF-16BE
             */
            case 25:
                return "utf-16be";


            /*
             * UTF-8
             */
            case 26:
                return "utf-8";


            /*
             * US-ASCII
             */
            case 27:
            case 170:
                return "windows-1252";


            /*
             * Big5
             */
            case 28:
                return "big5";


            /*
             * GB18030 / GB2312 family
             */
            case 29:
                return "gb18030";


            /*
             * EUC-KR
             */
            case 30:
                return "euc-kr";


            default:

                throw new Error(
                    `Unsupported QR ECI assignment: ${eci}`
                );
        }
    }


    /**
     * Converts bytes into JavaScript text.
     *
     * If an explicit encoding is supplied, TextDecoder is
     * used with that encoding.
     *
     * Without ECI:
     *
     * 1. Try strict UTF-8.
     * 2. Fall back to ISO-8859-1 / byte-for-byte text.
     *
     * @param {Uint8Array} bytes
     * @param {string|null} encoding
     *
     * @returns {string}
     */
    static decodeBytes(
        bytes,
        encoding = null
    ) {

        /*
         * Explicit ECI encoding.
         */
        if (encoding !== null) {

            if (
                typeof TextDecoder !==
                "undefined"
            ) {

                try {

                    return new TextDecoder(
                        encoding
                    ).decode(
                        bytes
                    );

                } catch (error) {

                    throw new Error(
                        `Browser does not support QR character encoding "${encoding}".`
                    );
                }
            }


            /*
             * UTF-8 fallback for environments without
             * TextDecoder.
             */
            if (
                encoding === "utf-8"
            ) {

                return QRDecodedBitStreamParser
                    .decodeUTF8Fallback(
                        bytes
                    );
            }


            /*
             * ISO-8859-1 can be represented directly by
             * JavaScript character codes 0-255.
             */
            if (
                encoding ===
                    "iso-8859-1" ||
                encoding ===
                    "windows-1252"
            ) {

                return QRDecodedBitStreamParser
                    .decodeLatin1(
                        bytes
                    );
            }


            throw new Error(
                `Cannot decode QR encoding "${encoding}" without TextDecoder.`
            );
        }


        /*
         * No ECI.
         *
         * Modern QR generators commonly place UTF-8 in
         * byte mode without an explicit ECI marker.
         */
        if (
            typeof TextDecoder !==
            "undefined"
        ) {

            try {

                return new TextDecoder(
                    "utf-8",
                    {
                        fatal: true
                    }
                ).decode(
                    bytes
                );

            } catch (error) {

                /*
                 * Not valid UTF-8. Fall through to Latin-1.
                 */
            }


            try {

                return new TextDecoder(
                    "iso-8859-1"
                ).decode(
                    bytes
                );

            } catch (error) {

                /*
                 * Use manual fallback below.
                 */
            }
        }


        return QRDecodedBitStreamParser
            .decodeLatin1(
                bytes
            );
    }


    /**
     * Simple ISO-8859-1 style byte-to-character conversion.
     *
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    static decodeLatin1(bytes) {

        let result = "";


        /*
         * Build in chunks so very large QR byte arrays do
         * not overflow Function.apply argument limits.
         */
        const chunkSize =
            1024;


        for (
            let start = 0;
            start < bytes.length;
            start += chunkSize
        ) {

            const end =
                Math.min(
                    start +
                    chunkSize,
                    bytes.length
                );


            for (
                let i = start;
                i < end;
                i++
            ) {

                result +=
                    String.fromCharCode(
                        bytes[i]
                    );
            }
        }


        return result;
    }


    /**
     * UTF-8 decoder fallback for browsers/environments
     * without TextDecoder.
     *
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    static decodeUTF8Fallback(
        bytes
    ) {

        let result = "";

        let i = 0;


        while (
            i < bytes.length
        ) {

            const first =
                bytes[i++];


            /*
             * ASCII
             */
            if (first < 0x80) {

                result +=
                    String.fromCharCode(
                        first
                    );

                continue;
            }


            /*
             * Two-byte UTF-8
             */
            if (
                (
                    first &
                    0xE0
                ) ===
                0xC0
            ) {

                if (
                    i >= bytes.length
                ) {
                    throw new Error(
                        "Invalid UTF-8 QR byte sequence."
                    );
                }


                const second =
                    bytes[i++];


                if (
                    (
                        second &
                        0xC0
                    ) !==
                    0x80
                ) {
                    throw new Error(
                        "Invalid UTF-8 QR continuation byte."
                    );
                }


                const codePoint =
                    (
                        (
                            first &
                            0x1F
                        ) <<
                        6
                    ) |
                    (
                        second &
                        0x3F
                    );


                if (
                    codePoint <
                    0x80
                ) {
                    throw new Error(
                        "Overlong UTF-8 QR sequence."
                    );
                }


                result +=
                    String.fromCharCode(
                        codePoint
                    );

                continue;
            }


            /*
             * Three-byte UTF-8
             */
            if (
                (
                    first &
                    0xF0
                ) ===
                0xE0
            ) {

                if (
                    i + 1 >=
                    bytes.length
                ) {
                    throw new Error(
                        "Invalid UTF-8 QR byte sequence."
                    );
                }


                const second =
                    bytes[i++];

                const third =
                    bytes[i++];


                if (
                    (
                        second &
                        0xC0
                    ) !==
                        0x80 ||
                    (
                        third &
                        0xC0
                    ) !==
                        0x80
                ) {
                    throw new Error(
                        "Invalid UTF-8 QR continuation byte."
                    );
                }


                const codePoint =
                    (
                        (
                            first &
                            0x0F
                        ) <<
                        12
                    ) |
                    (
                        (
                            second &
                            0x3F
                        ) <<
                        6
                    ) |
                    (
                        third &
                        0x3F
                    );


                if (
                    codePoint <
                        0x800 ||
                    (
                        codePoint >=
                            0xD800 &&
                        codePoint <=
                            0xDFFF
                    )
                ) {
                    throw new Error(
                        "Invalid UTF-8 QR sequence."
                    );
                }


                result +=
                    String.fromCharCode(
                        codePoint
                    );

                continue;
            }


            /*
             * Four-byte UTF-8
             */
            if (
                (
                    first &
                    0xF8
                ) ===
                0xF0
            ) {

                if (
                    i + 2 >=
                    bytes.length
                ) {
                    throw new Error(
                        "Invalid UTF-8 QR byte sequence."
                    );
                }


                const second =
                    bytes[i++];

                const third =
                    bytes[i++];

                const fourth =
                    bytes[i++];


                if (
                    (
                        second &
                        0xC0
                    ) !==
                        0x80 ||
                    (
                        third &
                        0xC0
                    ) !==
                        0x80 ||
                    (
                        fourth &
                        0xC0
                    ) !==
                        0x80
                ) {
                    throw new Error(
                        "Invalid UTF-8 QR continuation byte."
                    );
                }


                const codePoint =
                    (
                        (
                            first &
                            0x07
                        ) <<
                        18
                    ) |
                    (
                        (
                            second &
                            0x3F
                        ) <<
                        12
                    ) |
                    (
                        (
                            third &
                            0x3F
                        ) <<
                        6
                    ) |
                    (
                        fourth &
                        0x3F
                    );


                if (
                    codePoint <
                        0x10000 ||
                    codePoint >
                        0x10FFFF
                ) {
                    throw new Error(
                        "Invalid UTF-8 QR code point."
                    );
                }


                const adjusted =
                    codePoint -
                    0x10000;


                result +=
                    String.fromCharCode(
                        0xD800 +
                        (
                            adjusted >>
                            10
                        )
                    );


                result +=
                    String.fromCharCode(
                        0xDC00 +
                        (
                            adjusted &
                            0x3FF
                        )
                    );

                continue;
            }


            throw new Error(
                "Invalid UTF-8 QR leading byte."
            );
        }


        return result;
    }


    /**
     * Instance wrapper around the static decoder.
     *
     * QRCodeReader supports both static and instance parser
     * APIs.
     *
     * @param {*} bytes
     * @param {*} version
     * @param {*} errorCorrectionLevel
     *
     * @returns {Object}
     */
    decode(
        bytes,
        version,
        errorCorrectionLevel = null
    ) {

        return QRDecodedBitStreamParser
            .decode(
                bytes,
                version,
                errorCorrectionLevel
            );
    }
}