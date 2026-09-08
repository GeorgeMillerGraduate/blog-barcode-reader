/**
 * GenericGFPoly
 *
 * Represents a polynomial whose coefficients belong to a
 * GenericGF Galois Field.
 *
 * This is used by the Reed-Solomon decoder to perform
 * polynomial arithmetic when detecting and correcting errors.
 *
 * Coefficients are stored from highest degree to lowest:
 *
 * [a, b, c]
 *
 * represents:
 *
 * ax² + bx + c
 */
class GenericGFPoly {

    /**
     * Creates a polynomial over the supplied Galois Field.
     *
     * @param {GenericGF} field
     * @param {Array<number>|Int32Array|Uint8Array} coefficients
     */
    constructor(field, coefficients) {

        if (!field) {
            throw new Error(
                "GenericGFPoly requires a GenericGF field."
            );
        }

        if (
            !coefficients ||
            typeof coefficients.length !== "number" ||
            coefficients.length === 0
        ) {
            throw new Error(
                "GenericGFPoly requires at least one coefficient."
            );
        }

        this.field = field;


        /*
         * Validate every coefficient before storing it.
         */
        for (let i = 0; i < coefficients.length; i++) {

            if (
                !Number.isInteger(coefficients[i]) ||
                coefficients[i] < 0 ||
                coefficients[i] >= field.getSize()
            ) {
                throw new RangeError(
                    `Invalid polynomial coefficient: ${coefficients[i]}`
                );
            }
        }


        /*
         * Remove unnecessary leading zero coefficients.
         *
         * Example:
         *
         * [0, 0, 5, 3]
         *
         * becomes:
         *
         * [5, 3]
         *
         * The zero polynomial remains [0].
         */
        let firstNonZero = 0;

        while (
            firstNonZero < coefficients.length - 1 &&
            coefficients[firstNonZero] === 0
        ) {
            firstNonZero++;
        }


        this.coefficients =
            Int32Array.from(
                Array.from(coefficients).slice(firstNonZero)
            );
    }


    /**
     * Returns the polynomial coefficients.
     *
     * A copy is returned so callers cannot modify the
     * polynomial internally.
     *
     * @returns {Int32Array}
     */
    getCoefficients() {

        return new Int32Array(
            this.coefficients
        );
    }


    /**
     * Returns the degree of the polynomial.
     *
     * Example:
     *
     * ax² + bx + c
     *
     * has degree 2.
     *
     * @returns {number}
     */
    getDegree() {

        return this.coefficients.length - 1;
    }


    /**
     * Returns true if this is the zero polynomial.
     *
     * @returns {boolean}
     */
    isZero() {

        return (
            this.coefficients[0] === 0
        );
    }


    /**
     * Returns the coefficient for x^degree.
     *
     * Because coefficients are stored highest-degree first,
     * the array index must be converted.
     *
     * @param {number} degree
     * @returns {number}
     */
    getCoefficient(degree) {

        if (
            !Number.isInteger(degree) ||
            degree < 0 ||
            degree > this.getDegree()
        ) {
            throw new RangeError(
                `Polynomial degree out of range: ${degree}`
            );
        }

        return this.coefficients[
            this.coefficients.length - 1 - degree
        ];
    }


    /**
     * Evaluates this polynomial at the supplied field value.
     *
     * Uses Horner's method for efficiency.
     *
     * @param {number} a
     * @returns {number}
     */
    evaluateAt(a) {

        this.field.checkElement(a);


        /*
         * Special case:
         *
         * P(0) is simply the constant coefficient.
         */
        if (a === 0) {

            return this.getCoefficient(0);
        }


        /*
         * Special case:
         *
         * P(1) is the XOR of all coefficients because
         * multiplication by 1 changes nothing.
         */
        if (a === 1) {

            let result = 0;

            for (
                let i = 0;
                i < this.coefficients.length;
                i++
            ) {
                result =
                    this.field.addOrSubtract(
                        result,
                        this.coefficients[i]
                    );
            }

            return result;
        }


        /*
         * General case using Horner's method.
         */
        let result =
            this.coefficients[0];

        for (
            let i = 1;
            i < this.coefficients.length;
            i++
        ) {

            result =
                this.field.addOrSubtract(
                    this.field.multiply(
                        a,
                        result
                    ),
                    this.coefficients[i]
                );
        }

        return result;
    }


    /**
     * Adds or subtracts another polynomial.
     *
     * In GF(2^m), addition and subtraction are identical
     * and are performed using XOR.
     *
     * @param {GenericGFPoly} other
     * @returns {GenericGFPoly}
     */
    addOrSubtract(other) {

        this.checkField(other);


        /*
         * P + 0 = P
         */
        if (other.isZero()) {
            return this;
        }


        /*
         * 0 + P = P
         */
        if (this.isZero()) {
            return other;
        }


        /*
         * Work with the shorter and longer coefficient arrays.
         */
        let smallerCoefficients =
            this.coefficients;

        let largerCoefficients =
            other.coefficients;


        if (
            smallerCoefficients.length >
            largerCoefficients.length
        ) {

            const temp =
                smallerCoefficients;

            smallerCoefficients =
                largerCoefficients;

            largerCoefficients =
                temp;
        }


        const sum =
            new Int32Array(
                largerCoefficients.length
            );


        /*
         * Copy the high-degree terms that only exist
         * in the larger polynomial.
         */
        const lengthDifference =
            largerCoefficients.length -
            smallerCoefficients.length;


        for (
            let i = 0;
            i < lengthDifference;
            i++
        ) {

            sum[i] =
                largerCoefficients[i];
        }


        /*
         * XOR coefficients of matching degree.
         */
        for (
            let i = lengthDifference;
            i < largerCoefficients.length;
            i++
        ) {

            sum[i] =
                this.field.addOrSubtract(
                    smallerCoefficients[
                        i - lengthDifference
                    ],
                    largerCoefficients[i]
                );
        }


        return new GenericGFPoly(
            this.field,
            sum
        );
    }


    /**
     * Multiplies this polynomial by another polynomial.
     *
     * @param {GenericGFPoly} other
     * @returns {GenericGFPoly}
     */
    multiply(other) {

        this.checkField(other);


        if (
            this.isZero() ||
            other.isZero()
        ) {
            return this.field.getZero();
        }


        const aCoefficients =
            this.coefficients;

        const bCoefficients =
            other.coefficients;


        const product =
            new Int32Array(
                aCoefficients.length +
                bCoefficients.length -
                1
            );


        /*
         * Polynomial multiplication.
         *
         * Every coefficient from A is multiplied by every
         * coefficient from B.
         */
        for (
            let i = 0;
            i < aCoefficients.length;
            i++
        ) {

            const aCoefficient =
                aCoefficients[i];


            for (
                let j = 0;
                j < bCoefficients.length;
                j++
            ) {

                const multiplied =
                    this.field.multiply(
                        aCoefficient,
                        bCoefficients[j]
                    );


                product[i + j] =
                    this.field.addOrSubtract(
                        product[i + j],
                        multiplied
                    );
            }
        }


        return new GenericGFPoly(
            this.field,
            product
        );
    }


    /**
     * Multiplies the entire polynomial by one field element.
     *
     * @param {number} scalar
     * @returns {GenericGFPoly}
     */
    multiplyScalar(scalar) {

        this.field.checkElement(scalar);


        /*
         * P × 0 = 0
         */
        if (scalar === 0) {
            return this.field.getZero();
        }


        /*
         * P × 1 = P
         */
        if (scalar === 1) {
            return this;
        }


        const product =
            new Int32Array(
                this.coefficients.length
            );


        for (
            let i = 0;
            i < this.coefficients.length;
            i++
        ) {

            product[i] =
                this.field.multiply(
                    this.coefficients[i],
                    scalar
                );
        }


        return new GenericGFPoly(
            this.field,
            product
        );
    }


    /**
     * Multiplies this polynomial by:
     *
     * coefficient × x^degree
     *
     * @param {number} degree
     * @param {number} coefficient
     * @returns {GenericGFPoly}
     */
    multiplyByMonomial(
        degree,
        coefficient
    ) {

        if (
            !Number.isInteger(degree) ||
            degree < 0
        ) {
            throw new RangeError(
                "Monomial degree must be a non-negative integer."
            );
        }


        this.field.checkElement(
            coefficient
        );


        if (coefficient === 0) {
            return this.field.getZero();
        }


        /*
         * Extra zero coefficients at the end represent
         * multiplication by x^degree.
         */
        const product =
            new Int32Array(
                this.coefficients.length +
                degree
            );


        for (
            let i = 0;
            i < this.coefficients.length;
            i++
        ) {

            product[i] =
                this.field.multiply(
                    this.coefficients[i],
                    coefficient
                );
        }


        return new GenericGFPoly(
            this.field,
            product
        );
    }


    /**
     * Divides this polynomial by another polynomial.
     *
     * Returns:
     *
     * [quotient, remainder]
     *
     * @param {GenericGFPoly} other
     * @returns {[GenericGFPoly, GenericGFPoly]}
     */
    divide(other) {

        this.checkField(other);


        if (other.isZero()) {
            throw new Error(
                "Cannot divide by the zero polynomial."
            );
        }


        let quotient =
            this.field.getZero();

        let remainder =
            this;


        /*
         * Leading coefficient of the divisor.
         */
        const denominatorLeadingTerm =
            other.getCoefficient(
                other.getDegree()
            );


        /*
         * Multiplicative inverse allows division of
         * field coefficients.
         */
        const inverseDenominatorLeadingTerm =
            this.field.inverse(
                denominatorLeadingTerm
            );


        /*
         * Polynomial long division.
         */
        while (
            remainder.getDegree() >=
                other.getDegree() &&
            !remainder.isZero()
        ) {

            /*
             * Difference in polynomial degree determines
             * the power of x required.
             */
            const degreeDifference =
                remainder.getDegree() -
                other.getDegree();


            /*
             * Divide the leading coefficients.
             */
            const scale =
                this.field.multiply(
                    remainder.getCoefficient(
                        remainder.getDegree()
                    ),
                    inverseDenominatorLeadingTerm
                );


            /*
             * divisor × scale × x^degreeDifference
             */
            const term =
                other.multiplyByMonomial(
                    degreeDifference,
                    scale
                );


            /*
             * Corresponding quotient term.
             */
            const iterationQuotient =
                this.field.buildMonomial(
                    degreeDifference,
                    scale
                );


            quotient =
                quotient.addOrSubtract(
                    iterationQuotient
                );


            remainder =
                remainder.addOrSubtract(
                    term
                );
        }


        return [
            quotient,
            remainder
        ];
    }


    /**
     * Ensures that another polynomial belongs to the same
     * Galois Field as this polynomial.
     *
     * @param {GenericGFPoly} other
     */
    checkField(other) {

        if (
            !(other instanceof GenericGFPoly)
        ) {
            throw new TypeError(
                "Expected a GenericGFPoly."
            );
        }


        if (this.field !== other.field) {
            throw new Error(
                "GenericGFPoly operands must use the same Galois Field."
            );
        }
    }


    /**
     * Returns a human-readable polynomial representation.
     *
     * Useful while debugging Reed-Solomon calculations.
     *
     * Example:
     *
     * a^5x^2 + a^2x + 1
     *
     * @returns {string}
     */
    toString() {

        if (this.isZero()) {
            return "0";
        }


        let result = "";


        for (
            let degree = this.getDegree();
            degree >= 0;
            degree--
        ) {

            const coefficient =
                this.getCoefficient(
                    degree
                );


            if (coefficient === 0) {
                continue;
            }


            if (result.length > 0) {
                result += " + ";
            }


            /*
             * Convert the coefficient into logarithmic
             * alpha notation where useful.
             */
            if (coefficient === 1) {

                if (degree === 0) {
                    result += "1";
                }

            } else {

                const alphaPower =
                    this.field.log(
                        coefficient
                    );


                if (alphaPower === 0) {
                    result += "1";
                } else if (alphaPower === 1) {
                    result += "a";
                } else {
                    result += `a^${alphaPower}`;
                }
            }


            /*
             * Append the x term.
             */
            if (degree !== 0) {

                if (degree === 1) {
                    result += "x";
                } else {
                    result += `x^${degree}`;
                }
            }
        }


        return result;
    }
}