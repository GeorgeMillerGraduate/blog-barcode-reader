/**
 * DataMatrixDecoder
 *
 * Converts corrected ECC200 Data Matrix data codewords
 * into the original payload.
 *
 * Supported encodation modes:
 *
 * - ASCII
 * - C40
 * - Text
 * - ANSI X12
 * - EDIFACT
 * - Base256
 *
 * Also supports:
 *
 * - Numeric pairs
 * - Upper Shift
 * - FNC1
 * - Macro 05
 * - Macro 06
 *
 * Input:
 *
 * Array / Uint8Array containing corrected DATA codewords.
 *
 * Output:
 *
 * {
 *     text: "...",
 *     bytes: Uint8Array,
 *     fnc1: boolean,
 *     macro: null | "05" | "06"
 * }
 *
 * Browser-global class.
 */
class DataMatrixDecoder {

    /*
     * ---------------------------------------------------------
     * MODE CONSTANTS
     * ---------------------------------------------------------
     */

    static MODE_ASCII =
        "ASCII";

    static MODE_C40 =
        "C40";

    static MODE_TEXT =
        "TEXT";

    static MODE_X12 =
        "X12";

    static MODE_EDIFACT =
        "EDIFACT";

    static MODE_BASE256 =
        "BASE256";


    /**
     * Decodes corrected Data Matrix data codewords.
     *
     * @param {Array<number>|Uint8Array|Int32Array} codewords
     *
     * @returns {Object}
     */
    decode(codewords) {

        if (
            !codewords ||
            typeof codewords.length !== "number"
        ) {
            throw new TypeError(
                "DataMatrixDecoder.decode requires codewords."
            );
        }


        const bytes =
            Uint8Array.from(codewords);


        const state = {

            bytes:
                bytes,

            position:
                0,

            text:
                "",

            rawBytes:
                [],

            fnc1:
                false,

            macro:
                null,

            upperShift:
                false
        };


        let mode =
            DataMatrixDecoder.MODE_ASCII;


        while (
            state.position <
            bytes.length
        ) {

            switch (mode) {

                case DataMatrixDecoder.MODE_ASCII:

                    mode =
                        this.decodeASCII(
                            state
                        );

                    break;


                case DataMatrixDecoder.MODE_C40:

                    mode =
                        this.decodeC40(
                            state
                        );

                    break;


                case DataMatrixDecoder.MODE_TEXT:

                    mode =
                        this.decodeText(
                            state
                        );

                    break;


                case DataMatrixDecoder.MODE_X12:

                    mode =
                        this.decodeX12(
                            state
                        );

                    break;


                case DataMatrixDecoder.MODE_EDIFACT:

                    mode =
                        this.decodeEdifact(
                            state
                        );

                    break;


                case DataMatrixDecoder.MODE_BASE256:

                    mode =
                        this.decodeBase256(
                            state
                        );

                    break;


                case null:

                    state.position =
                        bytes.length;

                    break;


                default:

                    throw new Error(
                        `Unknown Data Matrix mode: ${mode}`
                    );
            }
        }


        /*
         * Macro 05 / 06 trailers are appended after decoding.
         */
        if (
            state.macro === "05" ||
            state.macro === "06"
        ) {

            state.text +=
                "\u001E\u0004";
        }


        return {

            text:
                state.text,

            bytes:
                Uint8Array.from(
                    state.rawBytes
                ),

            fnc1:
                state.fnc1,

            macro:
                state.macro
        };
    }


    /*
     * =========================================================
     * ASCII MODE
     * =========================================================
     */

    decodeASCII(state) {

        while (
            state.position <
            state.bytes.length
        ) {

            const codeword =
                state.bytes[
                    state.position++
                ];


            /*
             * 1 - 128:
             *
             * ASCII value = codeword - 1
             */
            if (
                codeword >= 1 &&
                codeword <= 128
            ) {

                let value =
                    codeword - 1;


                if (
                    state.upperShift
                ) {

                    value += 128;

                    state.upperShift =
                        false;
                }


                this.appendCharacter(
                    state,
                    value
                );


                return DataMatrixDecoder
                    .MODE_ASCII;
            }


            /*
             * 129 = PAD
             */
            if (
                codeword === 129
            ) {

                return null;
            }


            /*
             * 130 - 229:
             *
             * Encodes two decimal digits.
             */
            if (
                codeword >= 130 &&
                codeword <= 229
            ) {

                const value =
                    codeword - 130;


                if (value < 10) {

                    state.text +=
                        "0";
                }


                state.text +=
                    String(value);


                continue;
            }


            switch (codeword) {

                /*
                 * C40 latch
                 */
                case 230:

                    return DataMatrixDecoder
                        .MODE_C40;


                /*
                 * Base256 latch
                 */
                case 231:

                    return DataMatrixDecoder
                        .MODE_BASE256;


                /*
                 * FNC1
                 */
                case 232:

                    state.fnc1 =
                        true;

                    /*
                     * FNC1 is represented in the decoded
                     * byte stream as ASCII GS.
                     */
                    this.appendCharacter(
                        state,
                        29
                    );

                    break;


                /*
                 * Structured Append.
                 *
                 * ECC200 defines this value, but the following
                 * structured-append metadata is not part of the
                 * normal textual payload.
                 */
                case 233:

                    this.skipStructuredAppend(
                        state
                    );

                    break;


                /*
                 * Reader Programming
                 */
                case 234:

                    /*
                     * No textual output.
                     */
                    break;


                /*
                 * Upper Shift
                 */
                case 235:

                    state.upperShift =
                        true;

                    break;


                /*
                 * Macro 05
                 */
                case 236:

                    state.macro =
                        "05";

                    state.text +=
                        "[)>\u001E05\u001D";

                    break;


                /*
                 * Macro 06
                 */
                case 237:

                    state.macro =
                        "06";

                    state.text +=
                        "[)>\u001E06\u001D";

                    break;


                /*
                 * ANSI X12 latch
                 */
                case 238:

                    return DataMatrixDecoder
                        .MODE_X12;


                /*
                 * Text latch
                 */
                case 239:

                    return DataMatrixDecoder
                        .MODE_TEXT;


                /*
                 * EDIFACT latch
                 */
                case 240:

                    return DataMatrixDecoder
                        .MODE_EDIFACT;


                /*
                 * ECI
                 *
                 * This implementation consumes the ECI
                 * designator so the stream remains aligned.
                 */
                case 241:

                    this.readECI(
                        state
                    );

                    break;


                /*
                 * 254 may occur as an unlatch/end marker.
                 */
                case 254:

                    if (
                        state.position ===
                        state.bytes.length
                    ) {

                        return null;
                    }

                    break;


                default:

                    /*
                     * 242 - 253 are reserved.
                     */
                    if (
                        codeword >= 242 &&
                        codeword <= 253
                    ) {

                        throw new Error(
                            "Reserved Data Matrix ASCII " +
                            `codeword encountered: ${codeword}`
                        );
                    }


                    throw new Error(
                        "Invalid Data Matrix ASCII " +
                        `codeword: ${codeword}`
                    );
            }
        }


        return null;
    }


    /*
     * =========================================================
     * C40 MODE
     * =========================================================
     */

    decodeC40(state) {

        let shift = 0;

        let upperShift =
            false;


        while (
            state.position <
            state.bytes.length
        ) {

            /*
             * 254 unlatches back to ASCII.
             */
            if (
                state.bytes[
                    state.position
                ] === 254
            ) {

                state.position++;

                return DataMatrixDecoder
                    .MODE_ASCII;
            }


            if (
                state.position + 1 >=
                state.bytes.length
            ) {

                return DataMatrixDecoder
                    .MODE_ASCII;
            }


            const first =
                state.bytes[
                    state.position++
                ];

            const second =
                state.bytes[
                    state.position++
                ];


            const values =
                this.parseTwoBytes(
                    first,
                    second
                );


            for (
                let i = 0;
                i < 3;
                i++
            ) {

                const value =
                    values[i];


                /*
                 * ------------------------------------------------
                 * BASIC SET
                 * ------------------------------------------------
                 */
                if (
                    shift === 0
                ) {

                    if (value <= 2) {

                        shift =
                            value + 1;

                        continue;
                    }


                    if (value === 3) {

                        this.appendShiftedCharacter(
                            state,
                            32,
                            upperShift
                        );

                        upperShift =
                            false;

                        continue;
                    }


                    if (
                        value >= 4 &&
                        value <= 13
                    ) {

                        this.appendShiftedCharacter(
                            state,
                            48 +
                            value -
                            4,
                            upperShift
                        );

                        upperShift =
                            false;

                        continue;
                    }


                    if (
                        value >= 14 &&
                        value <= 39
                    ) {

                        this.appendShiftedCharacter(
                            state,
                            65 +
                            value -
                            14,
                            upperShift
                        );

                        upperShift =
                            false;

                        continue;
                    }


                    throw new Error(
                        `Invalid C40 value: ${value}`
                    );
                }


                /*
                 * ------------------------------------------------
                 * SHIFT 1
                 * ------------------------------------------------
                 */
                if (
                    shift === 1
                ) {

                    this.appendShiftedCharacter(
                        state,
                        value,
                        upperShift
                    );

                    upperShift =
                        false;

                    shift =
                        0;

                    continue;
                }


                /*
                 * ------------------------------------------------
                 * SHIFT 2
                 * ------------------------------------------------
                 */
                if (
                    shift === 2
                ) {

                    if (
                        value <= 14
                    ) {

                        const table =
                            [
                                33, 34, 35, 36, 37,
                                38, 39, 40, 41, 42,
                                43, 44, 45, 46, 47
                            ];


                        this.appendShiftedCharacter(
                            state,
                            table[value],
                            upperShift
                        );

                        upperShift =
                            false;

                    } else if (
                        value >= 15 &&
                        value <= 21
                    ) {

                        this.appendShiftedCharacter(
                            state,
                            58 +
                            value -
                            15,
                            upperShift
                        );

                        upperShift =
                            false;

                    } else if (
                        value >= 22 &&
                        value <= 26
                    ) {

                        this.appendShiftedCharacter(
                            state,
                            91 +
                            value -
                            22,
                            upperShift
                        );

                        upperShift =
                            false;

                    } else if (
                        value === 27
                    ) {

                        state.fnc1 =
                            true;

                        this.appendCharacter(
                            state,
                            29
                        );

                    } else if (
                        value === 30
                    ) {

                        upperShift =
                            true;

                    } else {

                        throw new Error(
                            `Invalid C40 shift-2 value: ${value}`
                        );
                    }


                    shift =
                        0;

                    continue;
                }


                /*
                 * ------------------------------------------------
                 * SHIFT 3
                 * ------------------------------------------------
                 */
                if (
                    shift === 3
                ) {

                    this.appendShiftedCharacter(
                        state,
                        value + 96,
                        upperShift
                    );

                    upperShift =
                        false;

                    shift =
                        0;
                }
            }
        }


        return DataMatrixDecoder
            .MODE_ASCII;
    }


    /*
     * =========================================================
     * TEXT MODE
     * =========================================================
     */

    decodeText(state) {

        let shift = 0;

        let upperShift =
            false;


        const shift3Table =
            [
                96,
                65, 66, 67, 68, 69,
                70, 71, 72, 73, 74,
                75, 76, 77, 78, 79,
                80, 81, 82, 83, 84,
                85, 86, 87, 88, 89,
                90,
                123, 124, 125, 126, 127
            ];


        while (
            state.position <
            state.bytes.length
        ) {

            if (
                state.bytes[
                    state.position
                ] === 254
            ) {

                state.position++;

                return DataMatrixDecoder
                    .MODE_ASCII;
            }


            if (
                state.position + 1 >=
                state.bytes.length
            ) {

                return DataMatrixDecoder
                    .MODE_ASCII;
            }


            const first =
                state.bytes[
                    state.position++
                ];

            const second =
                state.bytes[
                    state.position++
                ];


            const values =
                this.parseTwoBytes(
                    first,
                    second
                );


            for (
                let i = 0;
                i < 3;
                i++
            ) {

                const value =
                    values[i];


                /*
                 * BASIC SET
                 */
                if (
                    shift === 0
                ) {

                    if (
                        value <= 2
                    ) {

                        shift =
                            value + 1;

                        continue;
                    }


                    if (
                        value === 3
                    ) {

                        this.appendShiftedCharacter(
                            state,
                            32,
                            upperShift
                        );

                        upperShift =
                            false;

                        continue;
                    }


                    if (
                        value >= 4 &&
                        value <= 13
                    ) {

                        this.appendShiftedCharacter(
                            state,
                            48 +
                            value -
                            4,
                            upperShift
                        );

                        upperShift =
                            false;

                        continue;
                    }


                    if (
                        value >= 14 &&
                        value <= 39
                    ) {

                        this.appendShiftedCharacter(
                            state,
                            97 +
                            value -
                            14,
                            upperShift
                        );

                        upperShift =
                            false;

                        continue;
                    }


                    throw new Error(
                        `Invalid Text value: ${value}`
                    );
                }


                /*
                 * SHIFT 1
                 */
                if (
                    shift === 1
                ) {

                    this.appendShiftedCharacter(
                        state,
                        value,
                        upperShift
                    );

                    upperShift =
                        false;

                    shift =
                        0;

                    continue;
                }


                /*
                 * SHIFT 2
                 */
                if (
                    shift === 2
                ) {

                    if (
                        value <= 14
                    ) {

                        const table =
                            [
                                33, 34, 35, 36, 37,
                                38, 39, 40, 41, 42,
                                43, 44, 45, 46, 47
                            ];


                        this.appendShiftedCharacter(
                            state,
                            table[value],
                            upperShift
                        );

                        upperShift =
                            false;

                    } else if (
                        value >= 15 &&
                        value <= 21
                    ) {

                        this.appendShiftedCharacter(
                            state,
                            58 +
                            value -
                            15,
                            upperShift
                        );

                        upperShift =
                            false;

                    } else if (
                        value >= 22 &&
                        value <= 26
                    ) {

                        this.appendShiftedCharacter(
                            state,
                            91 +
                            value -
                            22,
                            upperShift
                        );

                        upperShift =
                            false;

                    } else if (
                        value === 27
                    ) {

                        state.fnc1 =
                            true;

                        this.appendCharacter(
                            state,
                            29
                        );

                    } else if (
                        value === 30
                    ) {

                        upperShift =
                            true;

                    } else {

                        throw new Error(
                            `Invalid Text shift-2 value: ${value}`
                        );
                    }


                    shift =
                        0;

                    continue;
                }


                /*
                 * SHIFT 3
                 */
                if (
                    shift === 3
                ) {

                    if (
                        value < 0 ||
                        value >=
                            shift3Table.length
                    ) {

                        throw new Error(
                            `Invalid Text shift-3 value: ${value}`
                        );
                    }


                    this.appendShiftedCharacter(
                        state,
                        shift3Table[value],
                        upperShift
                    );

                    upperShift =
                        false;

                    shift =
                        0;
                }
            }
        }


        return DataMatrixDecoder
            .MODE_ASCII;
    }


    /*
     * =========================================================
     * ANSI X12 MODE
     * =========================================================
     */

    decodeX12(state) {

        while (
            state.position <
            state.bytes.length
        ) {

            if (
                state.bytes[
                    state.position
                ] === 254
            ) {

                state.position++;

                return DataMatrixDecoder
                    .MODE_ASCII;
            }


            if (
                state.position + 1 >=
                state.bytes.length
            ) {

                return DataMatrixDecoder
                    .MODE_ASCII;
            }


            const values =
                this.parseTwoBytes(
                    state.bytes[
                        state.position++
                    ],
                    state.bytes[
                        state.position++
                    ]
                );


            for (
                let i = 0;
                i < 3;
                i++
            ) {

                const value =
                    values[i];


                if (
                    value === 0
                ) {

                    this.appendCharacter(
                        state,
                        13
                    );

                } else if (
                    value === 1
                ) {

                    this.appendCharacter(
                        state,
                        42
                    );

                } else if (
                    value === 2
                ) {

                    this.appendCharacter(
                        state,
                        62
                    );

                } else if (
                    value === 3
                ) {

                    this.appendCharacter(
                        state,
                        32
                    );

                } else if (
                    value >= 4 &&
                    value <= 13
                ) {

                    this.appendCharacter(
                        state,
                        48 +
                        value -
                        4
                    );

                } else if (
                    value >= 14 &&
                    value <= 39
                ) {

                    this.appendCharacter(
                        state,
                        65 +
                        value -
                        14
                    );

                } else {

                    throw new Error(
                        `Invalid ANSI X12 value: ${value}`
                    );
                }
            }
        }


        return DataMatrixDecoder
            .MODE_ASCII;
    }


    /*
     * =========================================================
     * EDIFACT MODE
     * =========================================================
     */

    decodeEdifact(state) {

        /*
         * EDIFACT stores four 6-bit values in three bytes.
         */
        while (
            state.position <
            state.bytes.length
        ) {

            const bitsRemaining =
                (
                    state.bytes.length -
                    state.position
                ) * 8;


            if (
                bitsRemaining < 6
            ) {

                return DataMatrixDecoder
                    .MODE_ASCII;
            }


            let bitPosition =
                state.position * 8;


            for (
                let i = 0;
                i < 4;
                i++
            ) {

                if (
                    bitPosition + 6 >
                    state.bytes.length * 8
                ) {

                    state.position =
                        state.bytes.length;

                    return DataMatrixDecoder
                        .MODE_ASCII;
                }


                const value =
                    this.readBitsAt(
                        state.bytes,
                        bitPosition,
                        6
                    );


                bitPosition += 6;


                /*
                 * 011111 = unlatch.
                 */
                if (
                    value === 0x1F
                ) {

                    /*
                     * Move to the next byte boundary.
                     */
                    state.position =
                        Math.ceil(
                            bitPosition / 8
                        );


                    return DataMatrixDecoder
                        .MODE_ASCII;
                }


                let character =
                    value;


                if (
                    (character & 0x20) === 0
                ) {

                    character |=
                        0x40;
                }


                this.appendCharacter(
                    state,
                    character
                );
            }


            state.position =
                Math.ceil(
                    bitPosition / 8
                );
        }


        return DataMatrixDecoder
            .MODE_ASCII;
    }


    /*
     * =========================================================
     * BASE256 MODE
     * =========================================================
     */

    decodeBase256(state) {

        if (
            state.position >=
            state.bytes.length
        ) {

            return DataMatrixDecoder
                .MODE_ASCII;
        }


        /*
         * Base256 codewords are randomised according to their
         * 1-based position in the complete codeword stream.
         */
        let position =
            state.position + 1;


        const first =
            this.unrandomise255State(
                state.bytes[
                    state.position++
                ],
                position
            );


        let count;


        if (
            first === 0
        ) {

            count =
                state.bytes.length -
                state.position;

        } else if (
            first <= 249
        ) {

            count =
                first;

        } else {

            if (
                state.position >=
                state.bytes.length
            ) {

                throw new Error(
                    "Truncated Data Matrix Base256 length."
                );
            }


            position =
                state.position + 1;


            const second =
                this.unrandomise255State(
                    state.bytes[
                        state.position++
                    ],
                    position
                );


            count =
                250 *
                (
                    first - 249
                ) +
                second;
        }


        if (
            count < 0 ||
            state.position + count >
                state.bytes.length
        ) {

            throw new Error(
                "Invalid Data Matrix Base256 length."
            );
        }


        for (
            let i = 0;
            i < count;
            i++
        ) {

            position =
                state.position + 1;


            const value =
                this.unrandomise255State(
                    state.bytes[
                        state.position++
                    ],
                    position
                );


            state.rawBytes.push(
                value
            );


            /*
             * Preserve byte values directly in the JavaScript
             * string. UTF-8 interpretation can be performed at
             * a higher layer if required.
             */
            state.text +=
                String.fromCharCode(
                    value
                );
        }


        return DataMatrixDecoder
            .MODE_ASCII;
    }


    /*
     * =========================================================
     * C40 / TEXT / X12 HELPERS
     * =========================================================
     */

    /**
     * Converts two codewords into three C40/Text/X12 values.
     *
     * combined =
     *
     *     (first << 8)
     *     + second
     *     - 1
     *
     * @returns {number[]}
     */
    parseTwoBytes(
        first,
        second
    ) {

        const full =
            (
                (first << 8) +
                second
            ) - 1;


        const firstValue =
            Math.floor(
                full / 1600
            );


        const remainder =
            full -
            firstValue * 1600;


        const secondValue =
            Math.floor(
                remainder / 40
            );


        const thirdValue =
            remainder -
            secondValue * 40;


        return [
            firstValue,
            secondValue,
            thirdValue
        ];
    }


    /**
     * Appends a character while respecting C40/Text upper shift.
     */
    appendShiftedCharacter(
        state,
        value,
        upperShift
    ) {

        if (
            upperShift
        ) {

            value +=
                128;
        }


        this.appendCharacter(
            state,
            value
        );
    }


    /*
     * =========================================================
     * BASE256 HELPERS
     * =========================================================
     */

    /**
     * Reverses the ECC200 Base256 randomisation algorithm.
     *
     * @param {number} randomised
     * @param {number} position
     *
     * @returns {number}
     */
    unrandomise255State(
        randomised,
        position
    ) {

        const pseudoRandom =
            (
                (
                    149 *
                    position
                ) %
                255
            ) + 1;


        let value =
            randomised -
            pseudoRandom;


        if (
            value < 0
        ) {

            value +=
                256;
        }


        return value;
    }


    /*
     * =========================================================
     * ECI
     * =========================================================
     */

    /**
     * Consumes an ECC200 ECI designator.
     *
     * The assignment number is retained for future character-set
     * conversion support.
     */
    readECI(state) {

        if (
            state.position >=
            state.bytes.length
        ) {

            throw new Error(
                "Truncated Data Matrix ECI sequence."
            );
        }


        const first =
            state.bytes[
                state.position++
            ];


        let value;


        if (
            first <= 127
        ) {

            value =
                first - 1;

        } else if (
            first <= 191
        ) {

            if (
                state.position >=
                state.bytes.length
            ) {

                throw new Error(
                    "Truncated Data Matrix ECI sequence."
                );
            }


            value =
                (
                    first - 128
                ) * 254 +
                state.bytes[
                    state.position++
                ] -
                1;

        } else {

            if (
                state.position + 1 >=
                state.bytes.length
            ) {

                throw new Error(
                    "Truncated Data Matrix ECI sequence."
                );
            }


            value =
                (
                    first - 192
                ) *
                64516 +
                (
                    state.bytes[
                        state.position++
                    ] - 1
                ) *
                254 +
                state.bytes[
                    state.position++
                ] -
                1;
        }


        state.eci =
            value;
    }


    /*
     * =========================================================
     * STRUCTURED APPEND
     * =========================================================
     */

    skipStructuredAppend(state) {

        /*
         * Structured append information follows codeword 233.
         * Keep the stream aligned where metadata is available.
         *
         * The scanner currently returns one symbol at a time,
         * so assembly of multiple symbols belongs at a higher
         * level.
         */

        state.structuredAppend =
            true;
    }


    /*
     * =========================================================
     * GENERAL HELPERS
     * =========================================================
     */

    /**
     * Adds a decoded byte/character.
     */
    appendCharacter(
        state,
        value
    ) {

        value &=
            0xFF;


        state.rawBytes.push(
            value
        );


        state.text +=
            String.fromCharCode(
                value
            );
    }


    /**
     * Reads arbitrary bits from an array without changing it.
     *
     * @param {Uint8Array} bytes
     * @param {number} bitPosition
     * @param {number} count
     *
     * @returns {number}
     */
    readBitsAt(
        bytes,
        bitPosition,
        count
    ) {

        let result = 0;


        for (
            let i = 0;
            i < count;
            i++
        ) {

            const absolute =
                bitPosition + i;


            const byteIndex =
                Math.floor(
                    absolute / 8
                );


            const bitIndex =
                7 -
                (
                    absolute %
                    8
                );


            const bit =
                (
                    bytes[
                        byteIndex
                    ] >>
                    bitIndex
                ) &
                1;


            result =
                (
                    result << 1
                ) |
                bit;
        }


        return result;
    }
}