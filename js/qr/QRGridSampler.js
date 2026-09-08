/**
 * QRGridSampler
 *
 * Samples a perspective-corrected QR Code from the original
 * binary image.
 *
 * QRDetector supplies:
 *
 * - Source BitMatrix
 * - QR dimensions
 * - Perspective transform
 *
 * QRGridSampler maps the centre of every logical QR module
 * through the perspective transform and copies the
 * corresponding source pixel into a new BitMatrix.
 *
 * Requires:
 *
 * - BitMatrix.js
 *
 * Compatible with the transform object produced by
 * QRDetector.createTransform():
 *
 * {
 *     a, b, c,
 *     d, e, f,
 *     g, h, i
 * }
 *
 * Transformation:
 *
 * x' = (a*x + b*y + c) / (g*x + h*y + i)
 * y' = (d*x + e*y + f) / (g*x + h*y + i)
 */
class QRGridSampler {

    /**
     * Samples a QR grid from an image.
     *
     * @param {BitMatrix} image
     * @param {number} dimensionX
     * @param {number} dimensionY
     * @param {*} transform
     *
     * @returns {BitMatrix}
     */
    static sampleGrid(
        image,
        dimensionX,
        dimensionY,
        transform
    ) {

        QRGridSampler.validateImage(
            image
        );


        QRGridSampler.validateDimension(
            dimensionX,
            "dimensionX"
        );


        QRGridSampler.validateDimension(
            dimensionY,
            "dimensionY"
        );


        QRGridSampler.validateTransform(
            transform
        );


        const result =
            new BitMatrix(
                dimensionX,
                dimensionY
            );


        /*
         * Reuse one coordinate array for every row.
         *
         * Layout:
         *
         * [
         *     x0, y0,
         *     x1, y1,
         *     x2, y2,
         *     ...
         * ]
         */
        const points =
            new Float64Array(
                dimensionX * 2
            );


        for (
            let y = 0;
            y < dimensionY;
            y++
        ) {

            /*
             * -------------------------------------------------
             * STEP 1
             *
             * Generate the ideal QR module-centre coordinates
             * for this row.
             *
             * Each QR module occupies:
             *
             * [0,1], [1,2], [2,3] ...
             *
             * so its centre is:
             *
             * 0.5, 1.5, 2.5 ...
             * -------------------------------------------------
             */
            const moduleY =
                y + 0.5;


            for (
                let x = 0;
                x < dimensionX;
                x++
            ) {

                const offset =
                    x * 2;


                points[offset] =
                    x + 0.5;


                points[
                    offset + 1
                ] =
                    moduleY;
            }


            /*
             * -------------------------------------------------
             * STEP 2
             *
             * Perspective-transform the complete row from
             * logical QR coordinates into source-image
             * coordinates.
             * -------------------------------------------------
             */
            QRGridSampler
                .transformPoints(
                    transform,
                    points
                );


            /*
             * -------------------------------------------------
             * STEP 3
             *
             * Correct tiny floating-point excursions at image
             * boundaries.
             * -------------------------------------------------
             */
            QRGridSampler
                .checkAndNudgePoints(
                    image,
                    points
                );


            /*
             * -------------------------------------------------
             * STEP 4
             *
             * Sample each transformed point.
             * -------------------------------------------------
             */
            for (
                let x = 0;
                x < dimensionX;
                x++
            ) {

                const offset =
                    x * 2;


                const sourceX =
                    Math.floor(
                        points[offset]
                    );


                const sourceY =
                    Math.floor(
                        points[
                            offset + 1
                        ]
                    );


                if (
                    image.get(
                        sourceX,
                        sourceY
                    )
                ) {

                    result.set(
                        x,
                        y
                    );
                }
            }
        }


        return result;
    }


    /**
     * Convenience method for square QR grids.
     *
     * @param {BitMatrix} image
     * @param {number} dimension
     * @param {*} transform
     *
     * @returns {BitMatrix}
     */
    static sampleSquareGrid(
        image,
        dimension,
        transform
    ) {

        return QRGridSampler
            .sampleGrid(
                image,
                dimension,
                dimension,
                transform
            );
    }


    /**
     * Instance wrapper around sampleGrid().
     *
     * @param {BitMatrix} image
     * @param {number} dimensionX
     * @param {number} dimensionY
     * @param {*} transform
     *
     * @returns {BitMatrix}
     */
    sampleGrid(
        image,
        dimensionX,
        dimensionY,
        transform
    ) {

        return QRGridSampler
            .sampleGrid(
                image,
                dimensionX,
                dimensionY,
                transform
            );
    }


    /**
     * Applies a perspective transform to an array of points.
     *
     * Points are stored as:
     *
     * [x0, y0, x1, y1, ...]
     *
     * The array is modified in place.
     *
     * @param {*} transform
     * @param {Array<number>|Float32Array|Float64Array} points
     *
     * @returns {*}
     */
    static transformPoints(
        transform,
        points
    ) {

        if (
            !points ||
            typeof points.length !==
                "number" ||
            (
                points.length &
                1
            ) !== 0
        ) {
            throw new TypeError(
                "QRGridSampler points must contain x/y coordinate pairs."
            );
        }


        /*
         * Support a transform class that already provides
         * its own point transformation method.
         */
        if (
            transform &&
            typeof transform
                .transformPoints ===
            "function"
        ) {

            const transformed =
                transform
                    .transformPoints(
                        points
                    );


            /*
             * Some implementations modify points in place.
             * Others return a new coordinate array.
             */
            if (
                transformed &&
                transformed !== points &&
                typeof transformed.length ===
                    "number"
            ) {

                if (
                    transformed.length !==
                    points.length
                ) {
                    throw new Error(
                        "Perspective transform returned an invalid point array."
                    );
                }


                for (
                    let i = 0;
                    i < points.length;
                    i++
                ) {

                    points[i] =
                        transformed[i];
                }
            }


            return points;
        }


        /*
         * Support a transform object with a single-point
         * transform method.
         */
        if (
            transform &&
            typeof transform
                .transformPoint ===
            "function"
        ) {

            for (
                let i = 0;
                i < points.length;
                i += 2
            ) {

                const transformed =
                    transform
                        .transformPoint(
                            points[i],
                            points[i + 1]
                        );


                if (
                    !transformed ||
                    !Number.isFinite(
                        transformed.x
                    ) ||
                    !Number.isFinite(
                        transformed.y
                    )
                ) {
                    throw new Error(
                        "Perspective transform produced an invalid QR point."
                    );
                }


                points[i] =
                    transformed.x;


                points[i + 1] =
                    transformed.y;
            }


            return points;
        }


        /*
         * QRDetector's transform is a plain 3×3 projective
         * matrix:
         *
         * [ a b c ]
         * [ d e f ]
         * [ g h i ]
         */
        const a =
            transform.a;

        const b =
            transform.b;

        const c =
            transform.c;

        const d =
            transform.d;

        const e =
            transform.e;

        const f =
            transform.f;

        const g =
            transform.g;

        const h =
            transform.h;

        const matrixI =
            transform.i;


        for (
            let index = 0;
            index < points.length;
            index += 2
        ) {

            const x =
                points[index];


            const y =
                points[
                    index + 1
                ];


            const denominator =
                g * x +
                h * y +
                matrixI;


            if (
                !Number.isFinite(
                    denominator
                ) ||
                Math.abs(
                    denominator
                ) <
                1e-12
            ) {
                throw new Error(
                    "Invalid QR perspective transform denominator."
                );
            }


            const transformedX =
                (
                    a * x +
                    b * y +
                    c
                ) /
                denominator;


            const transformedY =
                (
                    d * x +
                    e * y +
                    f
                ) /
                denominator;


            if (
                !Number.isFinite(
                    transformedX
                ) ||
                !Number.isFinite(
                    transformedY
                )
            ) {
                throw new Error(
                    "QR perspective transform produced non-finite coordinates."
                );
            }


            points[index] =
                transformedX;


            points[
                index + 1
            ] =
                transformedY;
        }


        return points;
    }


    /**
     * Transforms one point.
     *
     * @param {*} transform
     * @param {number} x
     * @param {number} y
     *
     * @returns {{x:number,y:number}}
     */
    static transformPoint(
        transform,
        x,
        y
    ) {

        const points =
            new Float64Array([
                x,
                y
            ]);


        QRGridSampler
            .transformPoints(
                transform,
                points
            );


        return {

            x:
                points[0],

            y:
                points[1]
        };
    }


    /**
     * Checks transformed coordinates and nudges points that
     * lie exactly on, or fractionally outside, an image
     * boundary.
     *
     * This follows the same principle used by ZXing's
     * GridSampler.checkAndNudgePoints().
     *
     * Coordinates farther than one pixel outside the image
     * are considered invalid.
     *
     * @param {BitMatrix} image
     * @param {Array<number>|Float32Array|Float64Array} points
     *
     * @returns {*}
     */
    static checkAndNudgePoints(
        image,
        points
    ) {

        QRGridSampler.validateImage(
            image
        );


        if (
            !points ||
            typeof points.length !==
                "number" ||
            (
                points.length &
                1
            ) !== 0
        ) {
            throw new TypeError(
                "QRGridSampler points must contain coordinate pairs."
            );
        }


        const width =
            image.width;


        const height =
            image.height;


        /*
         * -------------------------------------------------
         * FORWARD PASS
         *
         * ZXing performs a forward and reverse pass so edge
         * points are corrected without unnecessarily walking
         * the entire array when no edge adjustment is needed.
         * -------------------------------------------------
         */
        let nudged = true;


        for (
            let offset = 0;
            offset < points.length &&
                nudged;
            offset += 2
        ) {

            const x =
                points[offset];


            const y =
                points[
                    offset + 1
                ];


            QRGridSampler
                .validateTransformedPoint(
                    x,
                    y,
                    width,
                    height
                );


            const integerX =
                Math.floor(x);


            const integerY =
                Math.floor(y);


            nudged = false;


            if (integerX === -1) {

                points[offset] =
                    0;

                nudged = true;

            } else if (
                integerX === width
            ) {

                points[offset] =
                    width - 1;

                nudged = true;
            }


            if (integerY === -1) {

                points[
                    offset + 1
                ] =
                    0;

                nudged = true;

            } else if (
                integerY === height
            ) {

                points[
                    offset + 1
                ] =
                    height - 1;

                nudged = true;
            }
        }


        /*
         * -------------------------------------------------
         * REVERSE PASS
         * -------------------------------------------------
         */
        nudged = true;


        for (
            let offset =
                points.length - 2;
            offset >= 0 &&
                nudged;
            offset -= 2
        ) {

            const x =
                points[offset];


            const y =
                points[
                    offset + 1
                ];


            QRGridSampler
                .validateTransformedPoint(
                    x,
                    y,
                    width,
                    height
                );


            const integerX =
                Math.floor(x);


            const integerY =
                Math.floor(y);


            nudged = false;


            if (integerX === -1) {

                points[offset] =
                    0;

                nudged = true;

            } else if (
                integerX === width
            ) {

                points[offset] =
                    width - 1;

                nudged = true;
            }


            if (integerY === -1) {

                points[
                    offset + 1
                ] =
                    0;

                nudged = true;

            } else if (
                integerY === height
            ) {

                points[
                    offset + 1
                ] =
                    height - 1;

                nudged = true;
            }
        }


        /*
         * Perform a final strict check. This also protects
         * against unusual perspective transforms where an
         * interior point leaves the image even though the
         * row's edge points were valid.
         */
        for (
            let offset = 0;
            offset < points.length;
            offset += 2
        ) {

            let x =
                points[offset];


            let y =
                points[
                    offset + 1
                ];


            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y)
            ) {
                throw new Error(
                    "QR perspective transform produced an invalid coordinate."
                );
            }


            if (
                x < -1 ||
                x > width ||
                y < -1 ||
                y > height
            ) {
                throw new Error(
                    "QR sampling point lies outside the source image."
                );
            }


            /*
             * Deal with fractional edge cases as well.
             */
            if (x < 0) {
                x = 0;
            }


            if (x >= width) {
                x =
                    width - 1;
            }


            if (y < 0) {
                y = 0;
            }


            if (y >= height) {
                y =
                    height - 1;
            }


            points[offset] =
                x;


            points[
                offset + 1
            ] =
                y;
        }


        return points;
    }


    /**
     * Checks one transformed point against the image.
     *
     * Values from -1 through width/height are temporarily
     * tolerated because they can result from floating-point
     * rounding and are nudged onto the image.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    static validateTransformedPoint(
        x,
        y,
        width,
        height
    ) {

        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y)
        ) {
            throw new Error(
                "QR perspective transform produced non-finite coordinates."
            );
        }


        const integerX =
            Math.floor(x);


        const integerY =
            Math.floor(y);


        if (
            integerX < -1 ||
            integerX > width ||
            integerY < -1 ||
            integerY > height
        ) {
            throw new Error(
                `QR sampling point is outside the image: (${x}, ${y}).`
            );
        }
    }


    /**
     * Validates the source image.
     *
     * @param {*} image
     */
    static validateImage(image) {

        if (
            typeof BitMatrix ===
            "undefined"
        ) {
            throw new Error(
                "BitMatrix.js must be loaded before QRGridSampler."
            );
        }


        if (
            !(image instanceof BitMatrix)
        ) {
            throw new TypeError(
                "QRGridSampler requires a BitMatrix source image."
            );
        }


        if (
            !Number.isInteger(
                image.width
            ) ||
            !Number.isInteger(
                image.height
            ) ||
            image.width <= 0 ||
            image.height <= 0
        ) {
            throw new Error(
                "QRGridSampler received an invalid BitMatrix."
            );
        }
    }


    /**
     * Validates an output grid dimension.
     *
     * @param {number} dimension
     * @param {string} name
     */
    static validateDimension(
        dimension,
        name = "dimension"
    ) {

        if (
            !Number.isInteger(
                dimension
            ) ||
            dimension <= 0
        ) {
            throw new RangeError(
                `${name} must be a positive integer.`
            );
        }


        /*
         * A normal QR Code ranges from:
         *
         * Version 1  = 21×21
         * Version 40 = 177×177
         *
         * Do not enforce those limits here because keeping
         * GridSampler generic makes it easier to test.
         */
    }


    /**
     * Validates a perspective transform.
     *
     * @param {*} transform
     */
    static validateTransform(
        transform
    ) {

        if (!transform) {
            throw new TypeError(
                "QRGridSampler requires a perspective transform."
            );
        }


        /*
         * Transform object/class API.
         */
        if (
            typeof transform
                .transformPoints ===
                "function" ||
            typeof transform
                .transformPoint ===
                "function"
        ) {
            return;
        }


        /*
         * Plain 3×3 matrix API used by QRDetector.
         */
        const coefficients = [
            "a",
            "b",
            "c",
            "d",
            "e",
            "f",
            "g",
            "h",
            "i"
        ];


        for (
            let index = 0;
            index <
                coefficients.length;
            index++
        ) {

            const name =
                coefficients[index];


            if (
                !Number.isFinite(
                    transform[name]
                )
            ) {
                throw new TypeError(
                    `QR perspective transform is missing coefficient "${name}".`
                );
            }
        }
    }


    /**
     * Samples a grid when four ideal QR points and four
     * corresponding image points are supplied directly.
     *
     * This is useful independently of QRDetector.
     *
     * Source point order:
     *
     * top-left
     * top-right
     * bottom-right
     * bottom-left
     *
     * Destination point order must match.
     *
     * @param {BitMatrix} image
     * @param {number} dimension
     * @param {Object} sourceTopLeft
     * @param {Object} sourceTopRight
     * @param {Object} sourceBottomRight
     * @param {Object} sourceBottomLeft
     * @param {Object} imageTopLeft
     * @param {Object} imageTopRight
     * @param {Object} imageBottomRight
     * @param {Object} imageBottomLeft
     *
     * @returns {BitMatrix}
     */
    static sampleGridFromPoints(
        image,
        dimension,
        sourceTopLeft,
        sourceTopRight,
        sourceBottomRight,
        sourceBottomLeft,
        imageTopLeft,
        imageTopRight,
        imageBottomRight,
        imageBottomLeft
    ) {

        const transform =
            QRGridSampler
                .computePerspectiveTransform(
                    sourceTopLeft,
                    sourceTopRight,
                    sourceBottomRight,
                    sourceBottomLeft,

                    imageTopLeft,
                    imageTopRight,
                    imageBottomRight,
                    imageBottomLeft
                );


        return QRGridSampler
            .sampleGrid(
                image,
                dimension,
                dimension,
                transform
            );
    }


    /**
     * Computes a projective transformation between two
     * quadrilaterals.
     *
     * This duplicates the small amount of perspective maths
     * needed by the sampler so the class can also operate
     * independently from QRDetector.
     *
     * @returns {Object}
     */
    static computePerspectiveTransform(
        source0,
        source1,
        source2,
        source3,
        destination0,
        destination1,
        destination2,
        destination3
    ) {

        const sourceToSquare =
            QRGridSampler
                .quadrilateralToSquare(
                    source0,
                    source1,
                    source2,
                    source3
                );


        const squareToDestination =
            QRGridSampler
                .squareToQuadrilateral(
                    destination0,
                    destination1,
                    destination2,
                    destination3
                );


        return QRGridSampler
            .multiplyTransforms(
                squareToDestination,
                sourceToSquare
            );
    }


    /**
     * Creates a transform from a unit square to a
     * quadrilateral.
     *
     * @returns {Object}
     */
    static squareToQuadrilateral(
        p0,
        p1,
        p2,
        p3
    ) {

        QRGridSampler.validatePoint(p0);
        QRGridSampler.validatePoint(p1);
        QRGridSampler.validatePoint(p2);
        QRGridSampler.validatePoint(p3);


        const dx3 =
            p0.x -
            p1.x +
            p2.x -
            p3.x;


        const dy3 =
            p0.y -
            p1.y +
            p2.y -
            p3.y;


        /*
         * Affine quadrilateral.
         */
        if (
            Math.abs(dx3) <
                1e-12 &&
            Math.abs(dy3) <
                1e-12
        ) {

            return {

                a:
                    p1.x -
                    p0.x,

                b:
                    p3.x -
                    p0.x,

                c:
                    p0.x,

                d:
                    p1.y -
                    p0.y,

                e:
                    p3.y -
                    p0.y,

                f:
                    p0.y,

                g:
                    0,

                h:
                    0,

                i:
                    1
            };
        }


        const dx1 =
            p1.x -
            p2.x;


        const dx2 =
            p3.x -
            p2.x;


        const dy1 =
            p1.y -
            p2.y;


        const dy2 =
            p3.y -
            p2.y;


        const denominator =
            dx1 * dy2 -
            dx2 * dy1;


        if (
            Math.abs(
                denominator
            ) <
            1e-12
        ) {
            throw new Error(
                "Cannot construct perspective transform from a degenerate quadrilateral."
            );
        }


        const g =
            (
                dx3 * dy2 -
                dx2 * dy3
            ) /
            denominator;


        const h =
            (
                dx1 * dy3 -
                dx3 * dy1
            ) /
            denominator;


        return {

            a:
                p1.x -
                p0.x +
                g * p1.x,

            b:
                p3.x -
                p0.x +
                h * p3.x,

            c:
                p0.x,

            d:
                p1.y -
                p0.y +
                g * p1.y,

            e:
                p3.y -
                p0.y +
                h * p3.y,

            f:
                p0.y,

            g:
                g,

            h:
                h,

            i:
                1
        };
    }


    /**
     * Creates the inverse mapping:
     *
     * quadrilateral -> unit square
     *
     * @returns {Object}
     */
    static quadrilateralToSquare(
        p0,
        p1,
        p2,
        p3
    ) {

        return QRGridSampler
            .inverseTransform(
                QRGridSampler
                    .squareToQuadrilateral(
                        p0,
                        p1,
                        p2,
                        p3
                    )
            );
    }


    /**
     * Inverts a 3×3 projective matrix.
     *
     * @param {*} transform
     * @returns {Object}
     */
    static inverseTransform(
        transform
    ) {

        QRGridSampler
            .validateTransform(
                transform
            );


        const a =
            transform.a;

        const b =
            transform.b;

        const c =
            transform.c;

        const d =
            transform.d;

        const e =
            transform.e;

        const f =
            transform.f;

        const g =
            transform.g;

        const h =
            transform.h;

        const i =
            transform.i;


        const A =
            e * i -
            f * h;


        const B =
            c * h -
            b * i;


        const C =
            b * f -
            c * e;


        const D =
            f * g -
            d * i;


        const E =
            a * i -
            c * g;


        const F =
            c * d -
            a * f;


        const G =
            d * h -
            e * g;


        const H =
            b * g -
            a * h;


        const I =
            a * e -
            b * d;


        const determinant =
            a * A +
            b * D +
            c * G;


        if (
            !Number.isFinite(
                determinant
            ) ||
            Math.abs(
                determinant
            ) <
            1e-12
        ) {
            throw new Error(
                "QR perspective transform is singular."
            );
        }


        return {

            a:
                A /
                determinant,

            b:
                B /
                determinant,

            c:
                C /
                determinant,

            d:
                D /
                determinant,

            e:
                E /
                determinant,

            f:
                F /
                determinant,

            g:
                G /
                determinant,

            h:
                H /
                determinant,

            i:
                I /
                determinant
        };
    }


    /**
     * Multiplies two 3×3 transforms.
     *
     * result = left × right
     *
     * @param {*} left
     * @param {*} right
     *
     * @returns {Object}
     */
    static multiplyTransforms(
        left,
        right
    ) {

        QRGridSampler
            .validateTransform(
                left
            );


        QRGridSampler
            .validateTransform(
                right
            );


        return {

            a:
                left.a * right.a +
                left.b * right.d +
                left.c * right.g,

            b:
                left.a * right.b +
                left.b * right.e +
                left.c * right.h,

            c:
                left.a * right.c +
                left.b * right.f +
                left.c * right.i,


            d:
                left.d * right.a +
                left.e * right.d +
                left.f * right.g,

            e:
                left.d * right.b +
                left.e * right.e +
                left.f * right.h,

            f:
                left.d * right.c +
                left.e * right.f +
                left.f * right.i,


            g:
                left.g * right.a +
                left.h * right.d +
                left.i * right.g,

            h:
                left.g * right.b +
                left.h * right.e +
                left.i * right.h,

            i:
                left.g * right.c +
                left.h * right.f +
                left.i * right.i
        };
    }


    /**
     * Validates a point object.
     *
     * @param {*} point
     */
    static validatePoint(point) {

        if (
            !point ||
            !Number.isFinite(
                point.x
            ) ||
            !Number.isFinite(
                point.y
            )
        ) {
            throw new TypeError(
                "Perspective-transform points require finite x and y coordinates."
            );
        }
    }
}