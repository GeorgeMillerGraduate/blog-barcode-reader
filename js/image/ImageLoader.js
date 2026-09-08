/**
 * ImageLoader
 *
 * Loads images into a browser canvas and extracts ImageData
 * for the barcode scanning pipeline.
 *
 * Supported sources:
 *
 * - File objects from <input type="file">
 * - Blob objects
 * - Image URLs
 * - HTMLImageElement
 * - HTMLVideoElement / webcam frames
 * - Canvas elements
 *
 * Typical pipeline:
 *
 * ImageLoader
 *      ↓
 * ImageData
 *      ↓
 * Grayscale
 *      ↓
 * Binarizer
 *      ↓
 * BitMatrix
 */
class ImageLoader {

    /**
     * Creates a new ImageLoader.
     *
     * @param {HTMLCanvasElement|null} canvas
     */
    constructor(canvas = null) {

        /*
         * Use a supplied canvas where possible.
         *
         * This is useful because the scanner page already
         * contains #scannerCanvas.
         */
        if (canvas !== null) {

            if (
                typeof HTMLCanvasElement !== "undefined" &&
                !(canvas instanceof HTMLCanvasElement)
            ) {
                throw new TypeError(
                    "ImageLoader canvas must be an HTMLCanvasElement."
                );
            }

            this.canvas = canvas;

        } else {

            if (typeof document === "undefined") {
                throw new Error(
                    "ImageLoader requires a browser environment."
                );
            }

            this.canvas =
                document.createElement("canvas");
        }


        this.context =
            this.canvas.getContext(
                "2d",
                {
                    willReadFrequently: true
                }
            );


        if (!this.context) {
            throw new Error(
                "Unable to create a 2D canvas context."
            );
        }


        this.width = 0;
        this.height = 0;

        this.imageData = null;
    }


    /**
     * Loads an image from a File or Blob.
     *
     * This is the main method used when a user uploads
     * a QR/barcode image.
     *
     * @param {File|Blob} file
     * @param {number|null} maxWidth
     * @param {number|null} maxHeight
     * @returns {Promise<ImageData>}
     */
    async loadFile(
        file,
        maxWidth = null,
        maxHeight = null
    ) {

        if (!(file instanceof Blob)) {
            throw new TypeError(
                "ImageLoader.loadFile requires a File or Blob."
            );
        }


        /*
         * When the object is a File, reject obviously
         * unsupported non-image files.
         */
        if (
            file.type &&
            !file.type.startsWith("image/")
        ) {
            throw new Error(
                `Unsupported file type: ${file.type}`
            );
        }


        const objectURL =
            URL.createObjectURL(file);


        try {

            return await this.loadURL(
                objectURL,
                maxWidth,
                maxHeight
            );

        } finally {

            /*
             * Blob URLs should always be released after
             * the image has finished loading.
             */
            URL.revokeObjectURL(
                objectURL
            );
        }
    }


    /**
     * Loads an image from a URL.
     *
     * @param {string} url
     * @param {number|null} maxWidth
     * @param {number|null} maxHeight
     * @returns {Promise<ImageData>}
     */
    loadURL(
        url,
        maxWidth = null,
        maxHeight = null
    ) {

        if (
            typeof url !== "string" ||
            url.length === 0
        ) {
            return Promise.reject(
                new TypeError(
                    "ImageLoader.loadURL requires an image URL."
                )
            );
        }


        return new Promise(
            (resolve, reject) => {

                const image =
                    new Image();


                /*
                 * Allows canvas pixel access for remote images
                 * when the remote server permits CORS.
                 *
                 * Do not apply this to local blob/data URLs.
                 */
                if (
                    !url.startsWith("blob:") &&
                    !url.startsWith("data:")
                ) {
                    image.crossOrigin =
                        "anonymous";
                }


                image.onload = () => {

                    try {

                        const result =
                            this.loadImage(
                                image,
                                maxWidth,
                                maxHeight
                            );

                        resolve(result);

                    } catch (error) {

                        reject(error);
                    }
                };


                image.onerror = () => {

                    reject(
                        new Error(
                            "Unable to load image."
                        )
                    );
                };


                image.src = url;
            }
        );
    }


    /**
     * Loads an existing HTMLImageElement into the canvas.
     *
     * @param {HTMLImageElement} image
     * @param {number|null} maxWidth
     * @param {number|null} maxHeight
     * @returns {ImageData}
     */
    loadImage(
        image,
        maxWidth = null,
        maxHeight = null
    ) {

        if (
            typeof HTMLImageElement !== "undefined" &&
            !(image instanceof HTMLImageElement)
        ) {
            throw new TypeError(
                "ImageLoader.loadImage requires an HTMLImageElement."
            );
        }


        const sourceWidth =
            image.naturalWidth ||
            image.width;


        const sourceHeight =
            image.naturalHeight ||
            image.height;


        if (
            sourceWidth <= 0 ||
            sourceHeight <= 0
        ) {
            throw new Error(
                "Image has invalid dimensions."
            );
        }


        return this.drawSource(
            image,
            sourceWidth,
            sourceHeight,
            maxWidth,
            maxHeight
        );
    }


    /**
     * Captures the current frame from a video element.
     *
     * This is used for live webcam scanning.
     *
     * @param {HTMLVideoElement} video
     * @param {number|null} maxWidth
     * @param {number|null} maxHeight
     * @returns {ImageData}
     */
    loadVideoFrame(
        video,
        maxWidth = null,
        maxHeight = null
    ) {

        if (
            typeof HTMLVideoElement !== "undefined" &&
            !(video instanceof HTMLVideoElement)
        ) {
            throw new TypeError(
                "ImageLoader.loadVideoFrame requires an HTMLVideoElement."
            );
        }


        const sourceWidth =
            video.videoWidth;


        const sourceHeight =
            video.videoHeight;


        if (
            sourceWidth <= 0 ||
            sourceHeight <= 0
        ) {
            throw new Error(
                "Video frame is not ready."
            );
        }


        return this.drawSource(
            video,
            sourceWidth,
            sourceHeight,
            maxWidth,
            maxHeight
        );
    }


    /**
     * Loads another canvas into this loader.
     *
     * @param {HTMLCanvasElement} sourceCanvas
     * @param {number|null} maxWidth
     * @param {number|null} maxHeight
     * @returns {ImageData}
     */
    loadCanvas(
        sourceCanvas,
        maxWidth = null,
        maxHeight = null
    ) {

        if (
            typeof HTMLCanvasElement !== "undefined" &&
            !(sourceCanvas instanceof HTMLCanvasElement)
        ) {
            throw new TypeError(
                "ImageLoader.loadCanvas requires an HTMLCanvasElement."
            );
        }


        if (
            sourceCanvas.width <= 0 ||
            sourceCanvas.height <= 0
        ) {
            throw new Error(
                "Source canvas has invalid dimensions."
            );
        }


        return this.drawSource(
            sourceCanvas,
            sourceCanvas.width,
            sourceCanvas.height,
            maxWidth,
            maxHeight
        );
    }


    /**
     * Draws an image/video/canvas source into the loader's
     * internal canvas.
     *
     * The image is optionally scaled while preserving its
     * aspect ratio.
     *
     * @param {*} source
     * @param {number} sourceWidth
     * @param {number} sourceHeight
     * @param {number|null} maxWidth
     * @param {number|null} maxHeight
     * @returns {ImageData}
     */
    drawSource(
        source,
        sourceWidth,
        sourceHeight,
        maxWidth = null,
        maxHeight = null
    ) {

        const dimensions =
            this.calculateDimensions(
                sourceWidth,
                sourceHeight,
                maxWidth,
                maxHeight
            );


        this.width =
            dimensions.width;

        this.height =
            dimensions.height;


        /*
         * Changing canvas dimensions also clears it.
         */
        this.canvas.width =
            this.width;

        this.canvas.height =
            this.height;


        /*
         * Disable interpolation.
         *
         * This is useful for barcode images because we do not
         * want the browser unnecessarily smoothing sharp
         * module boundaries.
         */
        this.context.imageSmoothingEnabled =
            false;


        this.context.clearRect(
            0,
            0,
            this.width,
            this.height
        );


        this.context.drawImage(
            source,
            0,
            0,
            sourceWidth,
            sourceHeight,
            0,
            0,
            this.width,
            this.height
        );


        return this.extractImageData();
    }


    /**
     * Extracts ImageData from the current canvas.
     *
     * @returns {ImageData}
     */
    extractImageData() {

        if (
            this.canvas.width <= 0 ||
            this.canvas.height <= 0
        ) {
            throw new Error(
                "ImageLoader canvas is empty."
            );
        }


        try {

            this.imageData =
                this.context.getImageData(
                    0,
                    0,
                    this.canvas.width,
                    this.canvas.height
                );

        } catch (error) {

            throw new Error(
                "Unable to read image pixels. " +
                "The image may violate browser CORS restrictions."
            );
        }


        return this.imageData;
    }


    /**
     * Calculates output dimensions while preserving the
     * source aspect ratio.
     *
     * If no limits are supplied, the original dimensions
     * are returned.
     *
     * Images are never enlarged by this method.
     *
     * @param {number} width
     * @param {number} height
     * @param {number|null} maxWidth
     * @param {number|null} maxHeight
     *
     * @returns {{width:number, height:number}}
     */
    calculateDimensions(
        width,
        height,
        maxWidth = null,
        maxHeight = null
    ) {

        if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width <= 0 ||
            height <= 0
        ) {
            throw new RangeError(
                "Source dimensions must be positive."
            );
        }


        if (
            maxWidth !== null &&
            (
                !Number.isFinite(maxWidth) ||
                maxWidth <= 0
            )
        ) {
            throw new RangeError(
                "Maximum width must be positive."
            );
        }


        if (
            maxHeight !== null &&
            (
                !Number.isFinite(maxHeight) ||
                maxHeight <= 0
            )
        ) {
            throw new RangeError(
                "Maximum height must be positive."
            );
        }


        let scale = 1;


        if (
            maxWidth !== null &&
            width > maxWidth
        ) {
            scale =
                Math.min(
                    scale,
                    maxWidth / width
                );
        }


        if (
            maxHeight !== null &&
            height > maxHeight
        ) {
            scale =
                Math.min(
                    scale,
                    maxHeight / height
                );
        }


        return {
            width: Math.max(
                1,
                Math.round(
                    width * scale
                )
            ),

            height: Math.max(
                1,
                Math.round(
                    height * scale
                )
            )
        };
    }


    /**
     * Returns the last extracted ImageData.
     *
     * @returns {ImageData|null}
     */
    getImageData() {

        return this.imageData;
    }


    /**
     * Converts the currently loaded image directly into a
     * Grayscale object.
     *
     * Requires Grayscale.js.
     *
     * @returns {Grayscale}
     */
    getGrayscale() {

        if (!this.imageData) {
            throw new Error(
                "No image has been loaded."
            );
        }


        if (
            typeof Grayscale ===
            "undefined"
        ) {
            throw new Error(
                "Grayscale.js must be loaded before calling getGrayscale()."
            );
        }


        return Grayscale.fromImageData(
            this.imageData
        );
    }


    /**
     * Converts the currently loaded image directly into a
     * BitMatrix.
     *
     * Requires:
     *
     * - Grayscale.js
     * - Binarizer.js
     * - BitMatrix.js
     *
     * @returns {BitMatrix}
     */
    getBitMatrix() {

        const grayscale =
            this.getGrayscale();


        if (
            typeof Binarizer ===
            "undefined"
        ) {
            throw new Error(
                "Binarizer.js must be loaded before calling getBitMatrix()."
            );
        }


        const binarizer =
            new Binarizer(
                grayscale.getWidth(),
                grayscale.getHeight(),
                grayscale.getData()
            );


        return binarizer.binarize();
    }


    /**
     * Returns the canvas used internally by the loader.
     *
     * @returns {HTMLCanvasElement}
     */
    getCanvas() {

        return this.canvas;
    }


    /**
     * Returns the 2D rendering context.
     *
     * @returns {CanvasRenderingContext2D}
     */
    getContext() {

        return this.context;
    }


    /**
     * Returns the currently loaded width.
     *
     * @returns {number}
     */
    getWidth() {

        return this.width;
    }


    /**
     * Returns the currently loaded height.
     *
     * @returns {number}
     */
    getHeight() {

        return this.height;
    }


    /**
     * Returns true when image data has been loaded.
     *
     * @returns {boolean}
     */
    hasImage() {

        return (
            this.imageData !== null
        );
    }


    /**
     * Clears the current image.
     */
    clear() {

        this.context.clearRect(
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );


        this.canvas.width = 0;
        this.canvas.height = 0;

        this.width = 0;
        this.height = 0;

        this.imageData = null;
    }


    /**
     * Convenience method for loading a File and immediately
     * returning its grayscale representation.
     *
     * @param {File|Blob} file
     * @param {number|null} maxWidth
     * @param {number|null} maxHeight
     * @returns {Promise<Grayscale>}
     */
    async loadFileAsGrayscale(
        file,
        maxWidth = null,
        maxHeight = null
    ) {

        await this.loadFile(
            file,
            maxWidth,
            maxHeight
        );


        return this.getGrayscale();
    }


    /**
     * Convenience method for loading a File and immediately
     * returning its binary BitMatrix.
     *
     * @param {File|Blob} file
     * @param {number|null} maxWidth
     * @param {number|null} maxHeight
     * @returns {Promise<BitMatrix>}
     */
    async loadFileAsBitMatrix(
        file,
        maxWidth = null,
        maxHeight = null
    ) {

        await this.loadFile(
            file,
            maxWidth,
            maxHeight
        );


        return this.getBitMatrix();
    }
}