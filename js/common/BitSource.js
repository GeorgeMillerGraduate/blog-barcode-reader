/**
 * BitSource
 *
 * Reads an arbitrary number of bits from an array of bytes.
 *
 * Barcode formats frequently store values that do not align
 * perfectly with byte boundaries. BitSource keeps track of the
 * current byte and bit position and allows the decoder to read
 * values sequentially.
 *
 * Example:
 *
 * const source = new BitSource(
 *     new Uint8Array([0b10110110, 0b01101001])
 * );
 *
 * const first = source.readBits(4);  // 1011 = 11
 * const next  = source.readBits(6);  // 011001 = 25
 */
class BitSource {

    /**
     * Creates a new BitSource.
     *
     * @param {Array<number>|Uint8Array} bytes
     */
    constructor(bytes) {

        if (
            !Array.isArray(bytes) &&
            !(bytes instanceof Uint8Array)
        ) {
            throw new TypeError(
                "BitSource requires an Array or Uint8Array."
            );
        }

        /*
         * Store the data as unsigned 8-bit values.
         */
        this.bytes = bytes instanceof Uint8Array
            ? bytes
            : Uint8Array.from(bytes);

        /*
         * Index of the byte currently being read.
         */
        this.byteOffset = 0;

        /*
         * Number of bits already consumed from the current byte.
         *
         * Range:
         * 0 - 7
         */
        this.bitOffset = 0;
    }


    /**
     * Returns the number of unread bits remaining.
     *
     * @returns {number}
     */
    available() {

        return (
            (this.bytes.length - this.byteOffset) * 8
        ) - this.bitOffset;
    }


    /**
     * Reads between 1 and 32 bits from the source.
     *
     * Bits are read from most significant to least significant.
     *
     * @param {number} count
     * @returns {number}
     */
    readBits(count) {

        if (
            !Number.isInteger(count) ||
            count < 1 ||
            count > 32
        ) {
            throw new RangeError(
                "BitSource.readBits count must be between 1 and 32."
            );
        }

        if (count > this.available()) {
            throw new RangeError(
                `Cannot read ${count} bits. ` +
                `Only ${this.available()} bits remain.`
            );
        }

        let result = 0;


        /*
         * -----------------------------------------------------
         * STEP 1
         *
         * If we are part-way through a byte, consume the
         * remaining required bits from that byte first.
         * -----------------------------------------------------
         */

        if (this.bitOffset > 0) {

            const bitsLeftInByte =
                8 - this.bitOffset;

            const bitsToRead =
                Math.min(count, bitsLeftInByte);

            /*
             * Shift the desired bits down to the least
             * significant positions.
             */
            const bitsToNotRead =
                bitsLeftInByte - bitsToRead;

            const mask =
                (0xFF >> (8 - bitsToRead))
                << bitsToNotRead;

            result =
                (this.bytes[this.byteOffset] & mask)
                >> bitsToNotRead;

            count -= bitsToRead;

            this.bitOffset += bitsToRead;


            /*
             * Move to the next byte when the current byte
             * has been completely consumed.
             */
            if (this.bitOffset === 8) {

                this.bitOffset = 0;
                this.byteOffset++;
            }
        }


        /*
         * -----------------------------------------------------
         * STEP 2
         *
         * Consume complete bytes while at least eight bits
         * are still requested.
         * -----------------------------------------------------
         */

        while (count >= 8) {

            result =
                (result * 256) +
                this.bytes[this.byteOffset];

            this.byteOffset++;

            count -= 8;
        }


        /*
         * -----------------------------------------------------
         * STEP 3
         *
         * Read any final partial byte.
         * -----------------------------------------------------
         */

        if (count > 0) {

            const bitsToNotRead =
                8 - count;

            const mask =
                (0xFF >> bitsToNotRead)
                << bitsToNotRead;

            result =
                (result * (2 ** count)) +
                (
                    (this.bytes[this.byteOffset] & mask)
                    >> bitsToNotRead
                );

            this.bitOffset += count;
        }


        /*
         * JavaScript bitwise operators use signed 32-bit
         * integers. >>> 0 converts the final result to an
         * unsigned 32-bit value.
         */
        return result >>> 0;
    }


    /**
     * Returns the current byte offset.
     *
     * @returns {number}
     */
    getByteOffset() {

        return this.byteOffset;
    }


    /**
     * Returns the current bit offset within the current byte.
     *
     * @returns {number}
     */
    getBitOffset() {

        return this.bitOffset;
    }


    /**
     * Returns the total number of bits already consumed.
     *
     * @returns {number}
     */
    getPosition() {

        return (
            (this.byteOffset * 8) +
            this.bitOffset
        );
    }


    /**
     * Returns the total number of bits in the source.
     *
     * @returns {number}
     */
    getLength() {

        return this.bytes.length * 8;
    }


    /**
     * Returns true if there are at least count bits available.
     *
     * @param {number} count
     * @returns {boolean}
     */
    hasBits(count) {

        return (
            Number.isInteger(count) &&
            count >= 0 &&
            this.available() >= count
        );
    }


    /**
     * Skips a number of bits without returning them.
     *
     * @param {number} count
     */
    skipBits(count) {

        if (
            !Number.isInteger(count) ||
            count < 0
        ) {
            throw new RangeError(
                "BitSource.skipBits requires a non-negative integer."
            );
        }

        if (count > this.available()) {
            throw new RangeError(
                `Cannot skip ${count} bits. ` +
                `Only ${this.available()} bits remain.`
            );
        }

        const newPosition =
            this.getPosition() + count;

        this.byteOffset =
            Math.floor(newPosition / 8);

        this.bitOffset =
            newPosition % 8;
    }


    /**
     * Moves the reader to an absolute bit position.
     *
     * Position 0 represents the first bit of the first byte.
     *
     * @param {number} position
     */
    setPosition(position) {

        if (
            !Number.isInteger(position) ||
            position < 0 ||
            position > this.getLength()
        ) {
            throw new RangeError(
                "BitSource position is outside the source."
            );
        }

        this.byteOffset =
            Math.floor(position / 8);

        this.bitOffset =
            position % 8;
    }


    /**
     * Resets the source to its initial position.
     */
    reset() {

        this.byteOffset = 0;
        this.bitOffset = 0;
    }


    /**
     * Peeks at bits without advancing the current position.
     *
     * @param {number} count
     * @returns {number}
     */
    peekBits(count) {

        const savedByteOffset =
            this.byteOffset;

        const savedBitOffset =
            this.bitOffset;

        const result =
            this.readBits(count);

        this.byteOffset =
            savedByteOffset;

        this.bitOffset =
            savedBitOffset;

        return result;
    }


    /**
     * Returns true if the source has no unread bits.
     *
     * @returns {boolean}
     */
    isEmpty() {

        return this.available() === 0;
    }


    /**
     * Returns a copy of the underlying byte data.
     *
     * @returns {Uint8Array}
     */
    getBytes() {

        return new Uint8Array(
            this.bytes
        );
    }


    /**
     * Creates an independent copy of this BitSource,
     * including its current read position.
     *
     * @returns {BitSource}
     */
    clone() {

        const copy =
            new BitSource(this.bytes);

        copy.byteOffset =
            this.byteOffset;

        copy.bitOffset =
            this.bitOffset;

        return copy;
    }
}