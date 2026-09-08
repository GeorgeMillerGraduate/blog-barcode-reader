/**
 * app.js
 *
 * Front-end controller for the 2D Code Scanner.
 *
 * Connects the scanner page UI to BarcodeReader.js.
 *
 * Supports:
 *
 * - Uploaded PNG / JPEG / WebP images
 * - Drag and drop
 * - Live camera scanning
 * - Front/rear camera switching
 * - Automatic or manually selected format
 * - Copy decoded result
 * - Open decoded URL
 * - Scan again
 *
 * Requires the scanner HTML IDs created for the page:
 *
 * #imageInput
 * #uploadZone
 * #startCameraButton
 * #scanFormat
 * #scannerStatus
 * #scannerBadge
 * #scannerStage
 * #uploadedImage
 * #cameraContainer
 * #cameraVideo
 * #scannerCanvas
 * #switchCameraButton
 * #stopCameraButton
 * #detailFormat
 * #detailSource
 * #detailStatus
 * #resultPanel
 * #copyResultButton
 * #resultOutput
 * #resultActions
 * #openResultLink
 * #scanAgainButton
 *
 * Requires BarcodeReader.js and its dependencies to be
 * loaded before app.js.
 */

class ScannerApp {

    constructor() {

        /*
         * -------------------------------------------------
         * CORE READER
         * -------------------------------------------------
         */

        this.reader = null;


        /*
         * -------------------------------------------------
         * CAMERA STATE
         * -------------------------------------------------
         */

        this.cameraStream = null;

        this.cameraDevices = [];

        this.currentCameraIndex = 0;

        this.currentDeviceId = null;

        this.cameraFacingMode =
            "environment";


        /*
         * -------------------------------------------------
         * SCANNING STATE
         * -------------------------------------------------
         */

        this.isScanning =
            false;

        this.isCameraScanning =
            false;

        this.scanAnimationFrame =
            null;

        this.lastCameraScanTime =
            0;

        /*
         * Do not attempt a full decode on every rendered
         * video frame. Around 5 scans/second is enough for
         * a responsive scanner and avoids excessive CPU use.
         */
        this.cameraScanInterval =
            200;


        /*
         * -------------------------------------------------
         * IMAGE STATE
         * -------------------------------------------------
         */

        this.currentFile =
            null;

        this.currentImageURL =
            null;


        /*
         * -------------------------------------------------
         * RESULT STATE
         * -------------------------------------------------
         */

        this.currentResult =
            null;


        /*
         * -------------------------------------------------
         * DOM REFERENCES
         * -------------------------------------------------
         */

        this.elements = {};
    }


    /**
     * Initialises the scanner application.
     */
    init() {

        this.cacheElements();

        this.createReader();

        this.bindEvents();

        this.resetInterface();

        this.updateCameraAvailability();
    }


    /**
     * Stores references to scanner-page elements.
     */
    cacheElements() {

        this.elements.imageInput =
            document.getElementById(
                "imageInput"
            );


        this.elements.uploadZone =
            document.getElementById(
                "uploadZone"
            );


        this.elements.startCameraButton =
            document.getElementById(
                "startCameraButton"
            );


        this.elements.scanFormat =
            document.getElementById(
                "scanFormat"
            );


        this.elements.scannerStatus =
            document.getElementById(
                "scannerStatus"
            );


        this.elements.scannerBadge =
            document.getElementById(
                "scannerBadge"
            );


        this.elements.scannerStage =
            document.getElementById(
                "scannerStage"
            );


        this.elements.uploadedImage =
            document.getElementById(
                "uploadedImage"
            );


        this.elements.cameraContainer =
            document.getElementById(
                "cameraContainer"
            );


        this.elements.cameraVideo =
            document.getElementById(
                "cameraVideo"
            );


        this.elements.scannerCanvas =
            document.getElementById(
                "scannerCanvas"
            );


        this.elements.switchCameraButton =
            document.getElementById(
                "switchCameraButton"
            );


        this.elements.stopCameraButton =
            document.getElementById(
                "stopCameraButton"
            );


        this.elements.detailFormat =
            document.getElementById(
                "detailFormat"
            );


        this.elements.detailSource =
            document.getElementById(
                "detailSource"
            );


        this.elements.detailStatus =
            document.getElementById(
                "detailStatus"
            );


        this.elements.resultPanel =
            document.getElementById(
                "resultPanel"
            );


        this.elements.copyResultButton =
            document.getElementById(
                "copyResultButton"
            );


        this.elements.resultOutput =
            document.getElementById(
                "resultOutput"
            );


        this.elements.resultActions =
            document.getElementById(
                "resultActions"
            );


        this.elements.openResultLink =
            document.getElementById(
                "openResultLink"
            );


        this.elements.scanAgainButton =
            document.getElementById(
                "scanAgainButton"
            );


        /*
         * Empty-state element was not assigned a mandatory
         * ID in every version of the HTML, so support either
         * an ID or the common CSS class.
         */
        this.elements.emptyState =
            document.getElementById(
                "scannerEmptyState"
            ) ||
            document.querySelector(
                ".scanner-empty-state"
            ) ||
            document.querySelector(
                ".empty-state"
            );
    }


    /**
     * Creates the high-level BarcodeReader.
     */
    createReader() {

        if (
            typeof BarcodeReader ===
            "undefined"
        ) {
            throw new Error(
                "BarcodeReader.js must be loaded before app.js."
            );
        }


        this.reader =
            new BarcodeReader({

                format:
                    BarcodeReader
                        .FORMAT_AUTO,

                /*
                 * Large phone photographs do not need to be
                 * processed at their original 12/48 MP size.
                 */
                maxWidth:
                    1600,

                maxHeight:
                    1600,

                tryInverted:
                    true
            });
    }


    /**
     * Connects UI events.
     */
    bindEvents() {

        /*
         * -------------------------------------------------
         * FILE INPUT
         * -------------------------------------------------
         */

        if (
            this.elements.imageInput
        ) {

            this.elements.imageInput
                .addEventListener(
                    "change",
                    event => {

                        const files =
                            event
                                .target
                                .files;


                        if (
                            files &&
                            files.length > 0
                        ) {

                            this.handleFile(
                                files[0]
                            );
                        }
                    }
                );
        }


        /*
         * -------------------------------------------------
         * UPLOAD ZONE
         * -------------------------------------------------
         */

        if (
            this.elements.uploadZone
        ) {

            /*
             * Only activate the upload zone itself when the
             * click did not already come from the file input.
             */
            this.elements.uploadZone
                .addEventListener(
                    "click",
                    event => {

                        if (
                            event.target ===
                            this.elements
                                .imageInput
                        ) {
                            return;
                        }


                        if (
                            this.elements
                                .imageInput
                        ) {

                            this.elements
                                .imageInput
                                .click();
                        }
                    }
                );


            this.elements.uploadZone
                .addEventListener(
                    "dragover",
                    event => {

                        event
                            .preventDefault();


                        this.elements
                            .uploadZone
                            .classList
                            .add(
                                "drag-over"
                            );
                    }
                );


            this.elements.uploadZone
                .addEventListener(
                    "dragleave",
                    event => {

                        event
                            .preventDefault();


                        this.elements
                            .uploadZone
                            .classList
                            .remove(
                                "drag-over"
                            );
                    }
                );


            this.elements.uploadZone
                .addEventListener(
                    "drop",
                    event => {

                        event
                            .preventDefault();


                        this.elements
                            .uploadZone
                            .classList
                            .remove(
                                "drag-over"
                            );


                        const files =
                            event
                                .dataTransfer
                                .files;


                        if (
                            files &&
                            files.length > 0
                        ) {

                            this.handleFile(
                                files[0]
                            );
                        }
                    }
                );
        }


        /*
         * -------------------------------------------------
         * CAMERA
         * -------------------------------------------------
         */

        if (
            this.elements
                .startCameraButton
        ) {

            this.elements
                .startCameraButton
                .addEventListener(
                    "click",
                    () => {

                        this.startCamera();
                    }
                );
        }


        if (
            this.elements
                .stopCameraButton
        ) {

            this.elements
                .stopCameraButton
                .addEventListener(
                    "click",
                    () => {

                        this.stopCamera();
                    }
                );
        }


        if (
            this.elements
                .switchCameraButton
        ) {

            this.elements
                .switchCameraButton
                .addEventListener(
                    "click",
                    () => {

                        this.switchCamera();
                    }
                );
        }


        /*
         * -------------------------------------------------
         * FORMAT
         * -------------------------------------------------
         */

        if (
            this.elements.scanFormat
        ) {

            this.elements.scanFormat
                .addEventListener(
                    "change",
                    () => {

                        this.handleFormatChange();
                    }
                );
        }


        /*
         * -------------------------------------------------
         * RESULT ACTIONS
         * -------------------------------------------------
         */

        if (
            this.elements
                .copyResultButton
        ) {

            this.elements
                .copyResultButton
                .addEventListener(
                    "click",
                    () => {

                        this.copyResult();
                    }
                );
        }


        if (
            this.elements
                .scanAgainButton
        ) {

            this.elements
                .scanAgainButton
                .addEventListener(
                    "click",
                    () => {

                        this.scanAgain();
                    }
                );
        }


        /*
         * Stop webcam hardware when the user leaves the
         * page.
         */
        window.addEventListener(
            "beforeunload",
            () => {

                this.stopCamera(
                    false
                );
            }
        );


        window.addEventListener(
            "pagehide",
            () => {

                this.stopCamera(
                    false
                );
            }
        );
    }


    /**
     * Handles an uploaded image.
     *
     * @param {File} file
     */
    async handleFile(file) {

        if (!file) {
            return;
        }


        if (
            !this.isSupportedImageFile(
                file
            )
        ) {

            this.showError(
                "Please choose a PNG, JPEG or WebP image."
            );


            return;
        }


        /*
         * An uploaded image replaces the live camera source.
         */
        this.stopCamera(
            false
        );


        this.clearResult();


        this.currentFile =
            file;


        this.showUploadedImage(
            file
        );


        this.setSourceDetail(
            "Image"
        );


        this.setStatus(
            "Scanning image...",
            "SCANNING"
        );


        this.setDetailStatus(
            "Scanning"
        );


        this.isScanning =
            true;


        try {

            const result =
                await this.reader
                    .decodeFile(
                        file,
                        this.getSelectedFormat()
                    );


            this.isScanning =
                false;


            this.handleResult(
                result,
                "Image"
            );

        } catch (error) {

            this.isScanning =
                false;


            this.handleDecodeError(
                error,
                "No supported code was detected in this image."
            );
        }
    }


    /**
     * Displays an uploaded image in the scanner stage.
     *
     * @param {File} file
     */
    showUploadedImage(file) {

        if (
            !this.elements
                .uploadedImage
        ) {
            return;
        }


        this.revokeCurrentImageURL();


        this.currentImageURL =
            URL.createObjectURL(
                file
            );


        this.elements
            .uploadedImage
            .src =
                this.currentImageURL;


        this.elements
            .uploadedImage
            .hidden =
                false;


        this.elements
            .uploadedImage
            .style
            .display =
                "block";


        if (
            this.elements
                .cameraContainer
        ) {

            this.elements
                .cameraContainer
                .hidden =
                    true;


            this.elements
                .cameraContainer
                .style
                .display =
                    "none";
        }


        this.showEmptyState(
            false
        );
    }


    /**
     * Checks an uploaded file type.
     *
     * @param {File|Blob} file
     *
     * @returns {boolean}
     */
    isSupportedImageFile(file) {

        if (!file) {
            return false;
        }


        const type =
            (
                file.type ||
                ""
            )
                .toLowerCase();


        if (
            type === "image/png" ||
            type === "image/jpeg" ||
            type === "image/jpg" ||
            type === "image/webp"
        ) {
            return true;
        }


        /*
         * Some browsers/files may not expose MIME type
         * correctly. Fall back to filename extension.
         */
        const name =
            (
                file.name ||
                ""
            )
                .toLowerCase();


        return (
            name.endsWith(
                ".png"
            ) ||
            name.endsWith(
                ".jpg"
            ) ||
            name.endsWith(
                ".jpeg"
            ) ||
            name.endsWith(
                ".webp"
            )
        );
    }


    /**
     * Starts the preferred camera.
     */
    async startCamera() {

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices
                .getUserMedia
        ) {

            this.showError(
                "Camera access is not supported by this browser."
            );


            return;
        }


        this.clearResult();

        this.currentFile =
            null;


        if (
            this.elements
                .imageInput
        ) {

            this.elements
                .imageInput
                .value =
                    "";
        }


        this.hideUploadedImage();


        this.setStatus(
            "Requesting camera...",
            "CAMERA"
        );


        this.setDetailStatus(
            "Starting camera"
        );


        try {

            /*
             * Stop any previous stream before requesting a
             * new one.
             */
            this.stopCamera(
                false
            );


            const constraints = {

                video: {

                    facingMode: {
                        ideal:
                            this
                                .cameraFacingMode
                    },

                    width: {
                        ideal:
                            1280
                    },

                    height: {
                        ideal:
                            720
                    }
                },

                audio:
                    false
            };


            this.cameraStream =
                await navigator
                    .mediaDevices
                    .getUserMedia(
                        constraints
                    );


            await this.attachCameraStream();


            await this.refreshCameraDevices();


            this.isCameraScanning =
                true;


            this.isScanning =
                true;


            this.setSourceDetail(
                "Camera"
            );


            this.setStatus(
                "Point the camera at a code",
                "LIVE"
            );


            this.setDetailStatus(
                "Scanning"
            );


            this.startCameraScanLoop();

        } catch (error) {

            this.isCameraScanning =
                false;


            this.isScanning =
                false;


            this.cameraStream =
                null;


            this.handleCameraError(
                error
            );
        }
    }


    /**
     * Attaches the active MediaStream to the video element.
     */
    async attachCameraStream() {

        const video =
            this.elements
                .cameraVideo;


        if (!video) {
            throw new Error(
                "Camera video element was not found."
            );
        }


        video.srcObject =
            this.cameraStream;


        /*
         * Mobile browsers behave more reliably when these
         * attributes are also set programmatically.
         */
        video.muted =
            true;

        video.playsInline =
            true;


        await new Promise(
            (
                resolve,
                reject
            ) => {

                if (
                    video.readyState >= 2 &&
                    video.videoWidth > 0
                ) {

                    resolve();

                    return;
                }


                const loaded =
                    () => {

                        cleanup();

                        resolve();
                    };


                const failed =
                    () => {

                        cleanup();

                        reject(
                            new Error(
                                "The camera video could not be started."
                            )
                        );
                    };


                const cleanup =
                    () => {

                        video.removeEventListener(
                            "loadedmetadata",
                            loaded
                        );


                        video.removeEventListener(
                            "error",
                            failed
                        );
                    };


                video.addEventListener(
                    "loadedmetadata",
                    loaded,
                    {
                        once:
                            true
                    }
                );


                video.addEventListener(
                    "error",
                    failed,
                    {
                        once:
                            true
                    }
                );
            }
        );


        try {

            await video.play();

        } catch (error) {

            /*
             * A stream may already be playing automatically,
             * so only fail when the video is genuinely not
             * usable.
             */
            if (
                video.videoWidth <= 0
            ) {
                throw error;
            }
        }


        if (
            this.elements
                .cameraContainer
        ) {

            this.elements
                .cameraContainer
                .hidden =
                    false;


            this.elements
                .cameraContainer
                .style
                .display =
                    "";
        }


        this.showEmptyState(
            false
        );
    }


    /**
     * Continuously scans video frames.
     */
    startCameraScanLoop() {

        this.cancelCameraScanLoop();


        this.lastCameraScanTime =
            0;


        const scanFrame =
            timestamp => {

                if (
                    !this.isCameraScanning ||
                    !this.cameraStream
                ) {
                    return;
                }


                if (
                    timestamp -
                        this
                            .lastCameraScanTime >=
                    this.cameraScanInterval
                ) {

                    this.lastCameraScanTime =
                        timestamp;


                    this.scanCameraFrame();
                }


                if (
                    this.isCameraScanning
                ) {

                    this.scanAnimationFrame =
                        requestAnimationFrame(
                            scanFrame
                        );
                }
            };


        this.scanAnimationFrame =
            requestAnimationFrame(
                scanFrame
            );
    }


    /**
     * Attempts to decode one camera frame.
     */
    scanCameraFrame() {

        if (
            !this.isCameraScanning
        ) {
            return;
        }


        const video =
            this.elements
                .cameraVideo;


        if (
            !video ||
            video.readyState < 2 ||
            video.videoWidth <= 0 ||
            video.videoHeight <= 0
        ) {
            return;
        }


        /*
         * BarcodeReader.tryDecodeVideoFrame() deliberately
         * returns null while no code is visible. That means
         * failed frames do not flood the console/UI with
         * errors.
         */
        const result =
            this.reader
                .tryDecodeVideoFrame(
                    video,
                    this.getSelectedFormat()
                );


        if (result) {

            this.handleResult(
                result,
                "Camera"
            );


            /*
             * Freeze decoding once a successful result has
             * been obtained. The camera preview can remain
             * visible until the user scans again or stops it.
             */
            this.isCameraScanning =
                false;


            this.isScanning =
                false;


            this.cancelCameraScanLoop();
        }
    }


    /**
     * Stops camera hardware.
     *
     * @param {boolean} updateInterface
     */
    stopCamera(
        updateInterface = true
    ) {

        this.isCameraScanning =
            false;


        this.isScanning =
            false;


        this.cancelCameraScanLoop();


        if (
            this.cameraStream
        ) {

            const tracks =
                this.cameraStream
                    .getTracks();


            for (
                let i = 0;
                i < tracks.length;
                i++
            ) {

                tracks[i]
                    .stop();
            }
        }


        this.cameraStream =
            null;


        const video =
            this.elements
                .cameraVideo;


        if (video) {

            try {

                video.pause();

            } catch (error) {

                /*
                 * Nothing required.
                 */
            }


            video.srcObject =
                null;
        }


        if (
            this.elements
                .cameraContainer
        ) {

            this.elements
                .cameraContainer
                .hidden =
                    true;


            this.elements
                .cameraContainer
                .style
                .display =
                    "none";
        }


        if (
            updateInterface
        ) {

            if (
                !this.currentResult &&
                !this.currentFile
            ) {

                this.showEmptyState(
                    true
                );


                this.setStatus(
                    "Ready to scan",
                    "READY"
                );


                this.setSourceDetail(
                    "None"
                );


                this.setDetailStatus(
                    "Ready"
                );
            }
        }
    }


    /**
     * Cancels the camera requestAnimationFrame loop.
     */
    cancelCameraScanLoop() {

        if (
            this.scanAnimationFrame !==
            null
        ) {

            cancelAnimationFrame(
                this.scanAnimationFrame
            );


            this.scanAnimationFrame =
                null;
        }
    }


    /**
     * Finds available video-input devices.
     */
    async refreshCameraDevices() {

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices
                .enumerateDevices
        ) {
            return [];
        }


        try {

            const devices =
                await navigator
                    .mediaDevices
                    .enumerateDevices();


            this.cameraDevices =
                devices.filter(
                    device =>
                        device.kind ===
                        "videoinput"
                );


            const activeTrack =
                this.cameraStream
                    ?.getVideoTracks?.()[0];


            const settings =
                activeTrack
                    ?.getSettings?.();


            if (
                settings &&
                settings.deviceId
            ) {

                this.currentDeviceId =
                    settings.deviceId;


                const index =
                    this.cameraDevices
                        .findIndex(
                            device =>
                                device.deviceId ===
                                settings.deviceId
                        );


                if (index >= 0) {

                    this.currentCameraIndex =
                        index;
                }
            }


            this.updateSwitchCameraButton();


            return this.cameraDevices;

        } catch (error) {

            this.cameraDevices =
                [];


            this.updateSwitchCameraButton();


            return [];
        }
    }


    /**
     * Switches to the next available camera.
     */
    async switchCamera() {

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices
                .getUserMedia
        ) {
            return;
        }


        if (
            this.cameraDevices.length <
            2
        ) {

            await this.refreshCameraDevices();
        }


        /*
         * When device enumeration cannot identify multiple
         * cameras, toggle facingMode as a mobile fallback.
         */
        if (
            this.cameraDevices.length <
            2
        ) {

            this.cameraFacingMode =
                this.cameraFacingMode ===
                    "environment"
                    ? "user"
                    : "environment";


            await this.startCamera();

            return;
        }


        this.currentCameraIndex =
            (
                this.currentCameraIndex +
                1
            ) %
            this.cameraDevices.length;


        const device =
            this.cameraDevices[
                this.currentCameraIndex
            ];


        await this.startCameraByDevice(
            device.deviceId
        );
    }


    /**
     * Starts a specific physical camera.
     *
     * @param {string} deviceId
     */
    async startCameraByDevice(
        deviceId
    ) {

        if (!deviceId) {
            return;
        }


        this.stopCamera(
            false
        );


        this.clearResult();


        this.setStatus(
            "Switching camera...",
            "CAMERA"
        );


        try {

            this.cameraStream =
                await navigator
                    .mediaDevices
                    .getUserMedia({

                        video: {

                            deviceId: {
                                exact:
                                    deviceId
                            },

                            width: {
                                ideal:
                                    1280
                            },

                            height: {
                                ideal:
                                    720
                            }
                        },

                        audio:
                            false
                    });


            this.currentDeviceId =
                deviceId;


            await this.attachCameraStream();


            await this.refreshCameraDevices();


            this.isCameraScanning =
                true;


            this.isScanning =
                true;


            this.setSourceDetail(
                "Camera"
            );


            this.setStatus(
                "Point the camera at a code",
                "LIVE"
            );


            this.setDetailStatus(
                "Scanning"
            );


            this.startCameraScanLoop();

        } catch (error) {

            this.handleCameraError(
                error
            );
        }
    }


    /**
     * Handles a changed format selector.
     */
    handleFormatChange() {

        const format =
            this.getSelectedFormat();


        this.reader.setFormat(
            format
        );


        this.setFormatDetail(
            this.getFormatDisplayName(
                format
            )
        );


        /*
         * Re-scan the current uploaded file immediately.
         */
        if (
            this.currentFile
        ) {

            this.handleFile(
                this.currentFile
            );


            return;
        }


        /*
         * If camera preview is still active after a previous
         * result, changing format resumes live scanning.
         */
        if (
            this.cameraStream
        ) {

            this.clearResult();


            this.isCameraScanning =
                true;


            this.isScanning =
                true;


            this.setStatus(
                "Point the camera at a code",
                "LIVE"
            );


            this.setDetailStatus(
                "Scanning"
            );


            this.startCameraScanLoop();
        }
    }


    /**
     * Returns the currently selected format in the format
     * understood by BarcodeReader.
     *
     * @returns {string}
     */
    getSelectedFormat() {

        if (
            !this.elements
                .scanFormat
        ) {

            return BarcodeReader
                .FORMAT_AUTO;
        }


        const value =
            this.elements
                .scanFormat
                .value;


        return this.reader
            .normaliseFormat(
                value
            );
    }


    /**
     * Handles a successful decode.
     *
     * @param {Object} result
     * @param {string} source
     */
    handleResult(
        result,
        source
    ) {

        if (!result) {
            return;
        }


        this.currentResult =
            result;


        const text =
            typeof result.text ===
                "string"
                ? result.text
                : "";


        const format =
            result.format ||
            this.getSelectedFormat();


        this.setStatus(
            "Code decoded successfully",
            "DECODED"
        );


        this.setDetailStatus(
            "Decoded"
        );


        this.setSourceDetail(
            source
        );


        this.setFormatDetail(
            this.getFormatDisplayName(
                format
            )
        );


        /*
         * -------------------------------------------------
         * RESULT OUTPUT
         * -------------------------------------------------
         */

        if (
            this.elements
                .resultOutput
        ) {

            /*
             * textContent is important here. Decoded barcode
             * content must never be interpreted as HTML.
             */
            if (
                "value" in
                this.elements
                    .resultOutput
            ) {

                this.elements
                    .resultOutput
                    .value =
                        text;

            } else {

                this.elements
                    .resultOutput
                    .textContent =
                        text;
            }
        }


        if (
            this.elements
                .resultPanel
        ) {

            this.elements
                .resultPanel
                .hidden =
                    false;


            this.elements
                .resultPanel
                .style
                .display =
                    "";
        }


        if (
            this.elements
                .resultActions
        ) {

            this.elements
                .resultActions
                .hidden =
                    false;


            this.elements
                .resultActions
                .style
                .display =
                    "";
        }


        this.updateOpenResultLink(
            text
        );
    }


    /**
     * Displays a normal decoding failure.
     *
     * @param {Error} error
     * @param {string} fallbackMessage
     */
    handleDecodeError(
        error,
        fallbackMessage
    ) {

        console.warn(
            "Barcode decode failed:",
            error
        );


        this.currentResult =
            null;


        this.setStatus(
            fallbackMessage,
            "NOT FOUND"
        );


        this.setDetailStatus(
            "Not detected"
        );


        this.setFormatDetail(
            this.getFormatDisplayName(
                this.getSelectedFormat()
            )
        );
    }


    /**
     * Handles camera permission/device errors.
     *
     * @param {Error} error
     */
    handleCameraError(error) {

        console.error(
            "Camera error:",
            error
        );


        let message =
            "Unable to access the camera.";


        if (error) {

            switch (error.name) {

                case "NotAllowedError":

                    message =
                        "Camera permission was denied.";

                    break;


                case "NotFoundError":

                    message =
                        "No camera was found on this device.";

                    break;


                case "NotReadableError":

                    message =
                        "The camera is already in use or could not be opened.";

                    break;


                case "OverconstrainedError":

                    message =
                        "The selected camera does not support the requested settings.";

                    break;


                case "SecurityError":

                    message =
                        "Camera access is blocked by browser security settings.";

                    break;
            }
        }


        this.showError(
            message
        );


        this.setSourceDetail(
            "Camera"
        );


        this.setDetailStatus(
            "Unavailable"
        );


        this.showEmptyState(
            true
        );
    }


    /**
     * Copies the decoded text.
     */
    async copyResult() {

        if (
            !this.currentResult
        ) {
            return;
        }


        const text =
            this.currentResult
                .text ||
            "";


        if (!text) {
            return;
        }


        try {

            if (
                navigator.clipboard &&
                window.isSecureContext
            ) {

                await navigator
                    .clipboard
                    .writeText(
                        text
                    );

            } else {

                this.copyTextFallback(
                    text
                );
            }


            const button =
                this.elements
                    .copyResultButton;


            if (button) {

                const original =
                    button.textContent;


                button.textContent =
                    "Copied";


                window.setTimeout(
                    () => {

                        button.textContent =
                            original;
                    },
                    1200
                );
            }

        } catch (error) {

            console.error(
                "Could not copy result:",
                error
            );


            this.showError(
                "The decoded result could not be copied."
            );
        }
    }


    /**
     * Clipboard fallback for browsers without Clipboard API.
     *
     * @param {string} text
     */
    copyTextFallback(text) {

        const textarea =
            document.createElement(
                "textarea"
            );


        textarea.value =
            text;


        textarea.setAttribute(
            "readonly",
            ""
        );


        textarea.style.position =
            "fixed";

        textarea.style.left =
            "-9999px";


        document.body.appendChild(
            textarea
        );


        textarea.select();


        const successful =
            document.execCommand(
                "copy"
            );


        document.body.removeChild(
            textarea
        );


        if (!successful) {
            throw new Error(
                "Browser copy command failed."
            );
        }
    }


    /**
     * Shows/hides the Open Result action depending on
     * whether decoded text is a safe HTTP(S) URL.
     *
     * @param {string} text
     */
    updateOpenResultLink(text) {

        const link =
            this.elements
                .openResultLink;


        if (!link) {
            return;
        }


        const url =
            this.getSafeURL(
                text
            );


        if (!url) {

            link.hidden =
                true;


            link.style.display =
                "none";


            link.removeAttribute(
                "href"
            );


            return;
        }


        link.href =
            url;


        link.target =
            "_blank";


        link.rel =
            "noopener noreferrer";


        link.hidden =
            false;


        link.style.display =
            "";
    }


    /**
     * Accepts only HTTP and HTTPS result URLs.
     *
     * This prevents javascript: or other dangerous decoded
     * URI schemes being attached to the Open Result link.
     *
     * @param {string} text
     *
     * @returns {string|null}
     */
    getSafeURL(text) {

        if (
            typeof text !==
                "string"
        ) {
            return null;
        }


        const trimmed =
            text.trim();


        if (!trimmed) {
            return null;
        }


        try {

            const url =
                new URL(
                    trimmed
                );


            if (
                url.protocol !==
                    "http:" &&
                url.protocol !==
                    "https:"
            ) {
                return null;
            }


            return url.href;

        } catch (error) {

            return null;
        }
    }


    /**
     * Resets the current result and resumes the appropriate
     * scanner source.
     */
    scanAgain() {

        this.clearResult();


        /*
         * Resume the current live camera without requesting
         * permission again.
         */
        if (
            this.cameraStream &&
            this.elements
                .cameraVideo &&
            this.elements
                .cameraVideo
                .srcObject
        ) {

            this.isCameraScanning =
                true;


            this.isScanning =
                true;


            this.setStatus(
                "Point the camera at a code",
                "LIVE"
            );


            this.setDetailStatus(
                "Scanning"
            );


            this.startCameraScanLoop();


            return;
        }


        /*
         * Re-scan the uploaded file if one is still selected.
         */
        if (
            this.currentFile
        ) {

            this.handleFile(
                this.currentFile
            );


            return;
        }


        this.resetInterface();
    }


    /**
     * Clears only decoded-result UI.
     */
    clearResult() {

        this.currentResult =
            null;


        if (
            this.elements
                .resultOutput
        ) {

            if (
                "value" in
                this.elements
                    .resultOutput
            ) {

                this.elements
                    .resultOutput
                    .value =
                        "";

            } else {

                this.elements
                    .resultOutput
                    .textContent =
                        "";
            }
        }


        if (
            this.elements
                .resultPanel
        ) {

            this.elements
                .resultPanel
                .hidden =
                    true;


            this.elements
                .resultPanel
                .style
                .display =
                    "none";
        }


        if (
            this.elements
                .resultActions
        ) {

            this.elements
                .resultActions
                .hidden =
                    true;


            this.elements
                .resultActions
                .style
                .display =
                    "none";
        }


        if (
            this.elements
                .openResultLink
        ) {

            this.elements
                .openResultLink
                .hidden =
                    true;


            this.elements
                .openResultLink
                .style
                .display =
                    "none";


            this.elements
                .openResultLink
                .removeAttribute(
                    "href"
                );
        }
    }


    /**
     * Resets the scanner UI to its initial state.
     */
    resetInterface() {

        this.clearResult();


        this.isScanning =
            false;


        this.setStatus(
            "Ready to scan",
            "READY"
        );


        this.setDetailStatus(
            "Ready"
        );


        this.setSourceDetail(
            "None"
        );


        this.setFormatDetail(
            this.getFormatDisplayName(
                this.getSelectedFormat()
            )
        );


        if (
            !this.currentFile &&
            !this.cameraStream
        ) {

            this.showEmptyState(
                true
            );
        }
    }


    /**
     * Completely clears the current source.
     */
    clearSource() {

        this.stopCamera(
            false
        );


        this.currentFile =
            null;


        this.revokeCurrentImageURL();


        if (
            this.elements
                .imageInput
        ) {

            this.elements
                .imageInput
                .value =
                    "";
        }


        this.hideUploadedImage();


        this.reader.reset();


        this.resetInterface();
    }


    /**
     * Hides the uploaded image.
     */
    hideUploadedImage() {

        if (
            !this.elements
                .uploadedImage
        ) {
            return;
        }


        this.elements
            .uploadedImage
            .hidden =
                true;


        this.elements
            .uploadedImage
            .style
            .display =
                "none";


        this.elements
            .uploadedImage
            .removeAttribute(
                "src"
            );


        this.revokeCurrentImageURL();
    }


    /**
     * Releases an image-preview object URL.
     */
    revokeCurrentImageURL() {

        if (
            this.currentImageURL
        ) {

            URL.revokeObjectURL(
                this.currentImageURL
            );


            this.currentImageURL =
                null;
        }
    }


    /**
     * Shows/hides the scanner empty state.
     *
     * @param {boolean} visible
     */
    showEmptyState(visible) {

        if (
            !this.elements
                .emptyState
        ) {
            return;
        }


        this.elements
            .emptyState
            .hidden =
                !visible;


        this.elements
            .emptyState
            .style
            .display =
                visible
                    ? ""
                    : "none";
    }


    /**
     * Updates the primary status message and badge.
     *
     * @param {string} message
     * @param {string} badge
     */
    setStatus(
        message,
        badge
    ) {

        if (
            this.elements
                .scannerStatus
        ) {

            this.elements
                .scannerStatus
                .textContent =
                    message;
        }


        if (
            this.elements
                .scannerBadge
        ) {

            this.elements
                .scannerBadge
                .textContent =
                    badge;
        }
    }


    /**
     * Displays an error state.
     *
     * @param {string} message
     */
    showError(message) {

        this.setStatus(
            message,
            "ERROR"
        );


        this.setDetailStatus(
            "Error"
        );
    }


    /**
     * Updates format detail.
     *
     * @param {string} value
     */
    setFormatDetail(value) {

        if (
            this.elements
                .detailFormat
        ) {

            this.elements
                .detailFormat
                .textContent =
                    value;
        }
    }


    /**
     * Updates source detail.
     *
     * @param {string} value
     */
    setSourceDetail(value) {

        if (
            this.elements
                .detailSource
        ) {

            this.elements
                .detailSource
                .textContent =
                    value;
        }
    }


    /**
     * Updates scanner-state detail.
     *
     * @param {string} value
     */
    setDetailStatus(value) {

        if (
            this.elements
                .detailStatus
        ) {

            this.elements
                .detailStatus
                .textContent =
                    value;
        }
    }


    /**
     * Converts internal format identifiers to user-facing
     * names.
     *
     * @param {string} format
     *
     * @returns {string}
     */
    getFormatDisplayName(format) {

        let normalised;


        try {

            normalised =
                this.reader
                    .normaliseFormat(
                        format
                    );

        } catch (error) {

            normalised =
                format;
        }


        switch (normalised) {

            case BarcodeReader
                .FORMAT_AUTO:

                return "Automatic";


            case BarcodeReader
                .FORMAT_QR_CODE:

                return "QR Code";


            case BarcodeReader
                .FORMAT_MICRO_QR:

                return "Micro QR";


            case BarcodeReader
                .FORMAT_DATA_MATRIX:

                return "Data Matrix";


            case BarcodeReader
                .FORMAT_AZTEC:

                return "Aztec";


            case BarcodeReader
                .FORMAT_PDF417:

                return "PDF417";


            case BarcodeReader
                .FORMAT_MAXICODE:

                return "MaxiCode";


            default:

                return String(
                    normalised ||
                    "Unknown"
                );
        }
    }


    /**
     * Enables/disables camera controls based on browser
     * capability.
     */
    updateCameraAvailability() {

        const available =
            Boolean(
                navigator.mediaDevices &&
                navigator.mediaDevices
                    .getUserMedia
            );


        if (
            this.elements
                .startCameraButton
        ) {

            this.elements
                .startCameraButton
                .disabled =
                    !available;
        }


        this.updateSwitchCameraButton();
    }


    /**
     * Updates switch-camera button state.
     */
    updateSwitchCameraButton() {

        const button =
            this.elements
                .switchCameraButton;


        if (!button) {
            return;
        }


        /*
         * On mobile we may still be able to switch using
         * facingMode even before enumerateDevices exposes
         * device labels, so leave it enabled whenever camera
         * APIs exist.
         */
        const cameraSupported =
            Boolean(
                navigator.mediaDevices &&
                navigator.mediaDevices
                    .getUserMedia
            );


        button.disabled =
            !cameraSupported;
    }


    /**
     * Returns basic scanner diagnostics.
     *
     * Useful while developing the reader.
     *
     * @returns {Object}
     */
    getDiagnostics() {

        return {

            scanning:
                this.isScanning,

            cameraScanning:
                this.isCameraScanning,

            cameraActive:
                Boolean(
                    this.cameraStream
                ),

            cameras:
                this.cameraDevices
                    .length,

            format:
                this.getSelectedFormat(),

            hasResult:
                Boolean(
                    this.currentResult
                ),

            lastResult:
                this.reader
                    ?.getLastResult?.() ||
                null,

            lastError:
                this.reader
                    ?.getLastError?.() ||
                null,

            lastMatrix:
                this.reader
                    ?.getLastMatrix?.() ||
                null
        };
    }
}


/*
 * =========================================================
 * APPLICATION STARTUP
 * =========================================================
 */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        try {

            const app =
                new ScannerApp();


            app.init();


            /*
             * Expose the application during development.
             *
             * Browser console examples:
             *
             * scannerApp.getDiagnostics()
             * scannerApp.clearSource()
             * scannerApp.startCamera()
             */
            window.scannerApp =
                app;

        } catch (error) {

            console.error(
                "2D Code Scanner could not start:",
                error
            );


            const status =
                document.getElementById(
                    "scannerStatus"
                );


            const badge =
                document.getElementById(
                    "scannerBadge"
                );


            if (status) {

                status.textContent =
                    "Scanner could not start.";
            }


            if (badge) {

                badge.textContent =
                    "ERROR";
            }
        }
    }
);