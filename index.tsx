import { GoogleGenAI } from "@google/genai";
import { GdmLiveAudioVisuals3D } from './visual-3d';
import { gsap } from 'gsap';

class AiGuiApp {
    private sidebarButtons: NodeListOf<HTMLButtonElement>;
    private contentPanels: NodeListOf<HTMLDivElement>;
    private logContent: HTMLElement;
    private geminiRunBtn: HTMLButtonElement;
    private geminiPrompt: HTMLTextAreaElement;
    private geminiResponse: HTMLElement;
    private executeButtons: NodeListOf<HTMLButtonElement>;
    
    private ai: GoogleGenAI | null = null;
    private isLoading = false;
    private currentMode = 'gemini';
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private visualizerElement: GdmLiveAudioVisuals3D | null = null;
    private analyserNode: AnalyserNode | null = null;
    private audioDataArray: Uint8Array | null = null;
    private animationFrameId: number | null = null;
    private isAudioReactive = false;

    // SVG Visualizer properties
    private coreAnimation: gsap.core.Timeline | null = null;
    private colorRadios: NodeListOf<HTMLInputElement>;
    private speedRadios: NodeListOf<HTMLInputElement>;
    private lightningDelayedCall: gsap.core.Tween | null = null;
    private svgCoreElements: Element[] = [];
    private svgCoreRings: Element[] = [];
    private svgCircuitLines: SVGPathElement[] = [];
    private svgNodes: Element[] = [];
    private lightningElement: SVGElement | null = null;

    // Processor Stats
    private fileProcessorStats = { processed: 0, errors: 0, time: 0 };
    private batchProcessorStats = { processed: 0, errors: 0, time: 0 };
    
    // Ghosting Protocol properties
    private captureEchoBtn: HTMLButtonElement;
    private holdDurationSlider: HTMLInputElement;
    private holdDurationValue: HTMLElement;
    private echoAnalysisOutput: HTMLElement;
    private ghostingCanvasContainer: HTMLElement;
    private useLiveSensorsToggle: HTMLInputElement;
    
    // New properties from script adaptation
    private analyzerInput: HTMLInputElement;
    private analyzerOutput: HTMLElement;
    private analyzerOutputContainer: HTMLElement;
    private promptTokenCount: HTMLElement;
    private promptProcessingTier: HTMLElement;
    private statusGrid: HTMLElement;

    // Bitcoin Entropy Panel properties
    private bitcoinTimestampInterval: number | null = null;
    private bitcoinCanvasInterval: number | null = null;
    private boundDrawBitcoinVisualization = this.drawBitcoinEntropyVisualization.bind(this);


    constructor() {
        this.sidebarButtons = document.querySelectorAll('#sidebar .nav-link');
        this.contentPanels = document.querySelectorAll('.content-panel');
        this.logContent = document.getElementById('log-content')!;
        this.geminiRunBtn = document.getElementById('gemini-run') as HTMLButtonElement;
        this.geminiPrompt = document.getElementById('gemini-prompt') as HTMLTextAreaElement;
        this.geminiResponse = document.getElementById('gemini-response')!;
        this.executeButtons = document.querySelectorAll('.execute-btn');
        this.colorRadios = document.querySelectorAll('input[name="color"]');
        this.speedRadios = document.querySelectorAll('input[name="speed"]');

        // Ghosting Protocol Elements
        this.captureEchoBtn = document.getElementById('capture-echo-btn') as HTMLButtonElement;
        this.holdDurationSlider = document.getElementById('hold-duration-slider') as HTMLInputElement;
        this.holdDurationValue = document.getElementById('hold-duration-value')!;
        this.echoAnalysisOutput = document.getElementById('echo-analysis-output')!;
        this.ghostingCanvasContainer = document.getElementById('ghosting-canvas-container')!;
        this.useLiveSensorsToggle = document.getElementById('use-live-sensors-toggle') as HTMLInputElement;

        // New Elements
        this.analyzerInput = document.getElementById('analyzer-input') as HTMLInputElement;
        this.analyzerOutput = document.getElementById('analyzer-output')!;
        this.analyzerOutputContainer = document.getElementById('analyzer-output-container')!;
        this.promptTokenCount = document.getElementById('prompt-token-count')!;
        this.promptProcessingTier = document.getElementById('prompt-processing-tier')!;
        this.statusGrid = document.getElementById('status-grid')!;
        
        this.init();
    }

    private init() {
        this.log('info', 'AI Core Engine GUI Initialized.');
        try {
            this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            this.log('success', 'Gemini API client initialized successfully.');
        } catch (error) {
            this.log('error', `Failed to initialize Gemini API: ${error.message}`);
            this.geminiRunBtn.disabled = true;
            this.geminiPrompt.disabled = true;
            this.geminiPrompt.placeholder = "Gemini API key is missing or invalid.";
        }
        this.setupEventListeners();
        this.initSvgVisuals();
    }

    private setupEventListeners() {
        this.sidebarButtons.forEach(button => {
            button.addEventListener('click', () => this.switchMode(button.dataset.mode!));
        });

        this.geminiRunBtn.addEventListener('click', () => this.runGeminiPrompt());
        this.geminiPrompt.addEventListener('input', () => this.updatePromptComplexity());

        this.executeButtons.forEach(button => {
            button.addEventListener('click', () => this.simulateAction(button.dataset.action!));
        });

        document.getElementById('clear-log-btn')!.addEventListener('click', () => this.clearLog());

        this.colorRadios.forEach(radio => radio.addEventListener('change', this.handleColorChange.bind(this)));
        this.speedRadios.forEach(radio => radio.addEventListener('change', this.handleSpeedChange.bind(this)));
        
        // Ghosting protocol listeners
        this.captureEchoBtn.addEventListener('click', () => this.captureEcho());
        this.holdDurationSlider.addEventListener('input', () => this.handleHoldDurationChange());

    }
    
    private clearLog() {
        this.logContent.innerHTML = '';
    }

    private switchMode(mode: string) {
        if (this.currentMode === mode) return;

        // Stop audio stream if switching away from visualizer
        if (this.currentMode === 'visualizer' && this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
            this.log('info', 'Microphone stream stopped.');
            this.stopSvgAudioReaction();
        }
        
        // Stop bitcoin intervals if switching away
        if (this.currentMode === 'bitcoin') {
            this.stopBitcoinPanel();
        }

        this.log('info', `Switching to mode: ${mode}`);
        this.currentMode = mode;
        
        this.sidebarButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.mode === mode);
        });

        this.contentPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `panel-${mode}`);
        });

        if (mode === 'visualizer') {
            this.initAudioVisualizer();
        }
        if (mode === 'status') {
            this.updateSystemStatus();
        }
        if (mode === 'bitcoin') {
            this.initBitcoinPanel();
        }
    }

    private async initAudioVisualizer() {
        if (this.mediaStream) return; // Already initialized

        this.visualizerElement = document.querySelector('gdm-live-audio-visuals-3d') as GdmLiveAudioVisuals3D;
        if (!this.visualizerElement) {
            this.log('error', 'Audio visualizer component not found.');
            return;
        }

        try {
            this.log('info', 'Requesting microphone access...');
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.log('success', 'Microphone access granted.');

            if (!this.audioContext) {
                this.audioContext = new AudioContext();
            }
            
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Setup analyser for SVG reaction
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 128;
            const bufferLength = this.analyserNode.frequencyBinCount;
            this.audioDataArray = new Uint8Array(bufferLength);
            source.connect(this.analyserNode);

            // Create a muted gain node to avoid feedback, as we only want to visualize
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = 0;
            this.analyserNode.connect(gainNode); // Connect analyser to gain
            gainNode.connect(this.audioContext.destination);

            this.visualizerElement.inputNode = source;
            this.visualizerElement.outputNode = gainNode;

            this.startSvgAudioReaction();

        } catch (err) {
            const errorMessage = `Could not get microphone access: ${err.message}`;
            this.log('error', errorMessage);
            const visualizerContainer = document.getElementById('visualizer-container');
            if(visualizerContainer) {
                visualizerContainer.innerHTML = `<p style="color: var(--accent-color-red);">${errorMessage}. Please allow access in browser settings.</p>`;
            }
        }
    }


    private log(type: 'info' | 'success' | 'warn' | 'error', message: string) {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.textContent = message;
        this.logContent.appendChild(entry);
        this.logContent.scrollTop = this.logContent.scrollHeight;
    }

    private async runGeminiPrompt() {
        if (!this.ai || this.isLoading) return;

        const prompt = this.geminiPrompt.value.trim();
        if (!prompt) {
            this.log('warn', 'Prompt is empty. Please enter a prompt.');
            return;
        }

        this.log('info', `Executing prompt on gemini-2.5-flash...`);
        this.isLoading = true;
        this.geminiRunBtn.disabled = true;
        this.geminiResponse.textContent = '';

        try {
            const responseStream = await this.ai.models.generateContentStream({
                model: "gemini-2.5-flash",
                contents: prompt,
            });

            for await (const chunk of responseStream) {
                this.geminiResponse.textContent += chunk.text;
            }
            this.log('success', 'Gemini prompt executed successfully.');

        } catch (error) {
            const errorMessage = `Error executing Gemini prompt: ${error.message}`;
            this.log('error', errorMessage);
            this.geminiResponse.textContent = errorMessage;
        } finally {
            this.isLoading = false;
            this.geminiRunBtn.disabled = false;
        }
    }

    private simulateAction(action: string) {
        this.log('info', `Simulating action: ${action}`);
        switch(action) {
            case 'file': {
                const filePath = (document.getElementById('file-input') as HTMLInputElement).value || '/path/to/dummy.txt';
                this.log('info', `Processing file: ${filePath}`);
                
                // Simulate stats
                const processedFiles = Math.floor(Math.random() * 80) + 20;
                const fileErrors = Math.floor(Math.random() * 5);
                const fileTime = parseFloat((Math.random() * 2 + 0.5).toFixed(2));
                this.fileProcessorStats = { processed: processedFiles, errors: fileErrors, time: fileTime };
                this.updateStatsChart('panel-file', this.fileProcessorStats);

                this.log('info', `Backup created for ${filePath}`);
                this.log('success', `File processing complete. Processed: ${processedFiles}, Errors: ${fileErrors}, Time: ${fileTime}s.`);
                break;
            }
            case 'batch': {
                const pattern = (document.getElementById('batch-input') as HTMLInputElement).value || '*.log';
                this.log('info', `Batch processing files with pattern: ${pattern}`);

                // Simulate stats
                const processedBatch = Math.floor(Math.random() * 80) + 20;
                const batchErrors = Math.floor(Math.random() * 10);
                const batchTime = parseFloat((Math.random() * 4 + 1).toFixed(2));
                this.batchProcessorStats = { processed: processedBatch, errors: batchErrors, time: batchTime };
                this.updateStatsChart('panel-batch', this.batchProcessorStats);

                this.log('success', `Batch processing complete. Processed: ${processedBatch}, Errors: ${batchErrors}, Time: ${batchTime}s.`);
                break;
            }
            case 'pipeline':
                const pipelineInput = (document.getElementById('pipeline-input') as HTMLInputElement).value || 'https://example.com:dummy.log';
                this.log('info', `Running pipeline for: ${pipelineInput}`);
                this.log('success', `Pipeline execution complete.`);
                break;
            case 'env':
                 const envOutput = document.getElementById('env-output')!;
                 envOutput.textContent = `Scanning environment...\n\nUSER=dev\nHOME=/home/dev\nSHELL=/bin/bash\nTERM=xterm-256color\n\nDisk Usage:\nFilesystem   Size  Used Avail Use% Mounted on\n/dev/sda1    100G   20G   80G  20% /\n\nScan complete.`;
                 this.log('success', 'Environment scan complete.');
                break;
            case 'agi':
                const folder = (document.getElementById('agi-folder') as HTMLInputElement).value || '/var/log';
                this.log('info', `Watching folder ${folder} for changes...`);
                this.log('warn', 'AGI Watcher is a simulation. No real file monitoring is active.');
                break;
            case 'analyze-tokens':
                this.simulateTokenAnalysis();
                break;
        }
    }

    private updateStatsChart(panelId: string, stats: { processed: number, errors: number, time: number }) {
        const chart = document.querySelector(`#${panelId} .stats-chart`);
        if (!chart) return;
    
        const barProcessed = chart.querySelector('.bar-processed') as SVGRectElement;
        const barErrors = chart.querySelector('.bar-errors') as SVGRectElement;
        const barTime = chart.querySelector('.bar-time') as SVGRectElement;
    
        const valueProcessed = chart.querySelector('.value-processed') as SVGTextElement;
        const valueErrors = chart.querySelector('.value-errors') as SVGTextElement;
        const valueTime = chart.querySelector('.value-time') as SVGTextElement;
    
        const MAX_PROCESSED = 100;
        const MAX_ERRORS = 10;
        const MAX_TIME = 5; // seconds
        const MAX_BAR_HEIGHT = 120; // in SVG units (viewBox height - margins)
    
        const processedHeight = (stats.processed / MAX_PROCESSED) * MAX_BAR_HEIGHT;
        const errorsHeight = (stats.errors / MAX_ERRORS) * MAX_BAR_HEIGHT;
        const timeHeight = (stats.time / MAX_TIME) * MAX_BAR_HEIGHT;
    
        // Refined animation config with overshoot/bounce effect
        const animationConfig = { duration: 1.2, ease: 'back.out(1.4)' };
    
        // Animate bars
        gsap.to(barProcessed, { ...animationConfig, attr: { height: processedHeight, y: 130 - processedHeight } });
        gsap.to(barErrors, { ...animationConfig, attr: { height: errorsHeight, y: 130 - errorsHeight } });
        gsap.to(barTime, { ...animationConfig, attr: { height: timeHeight, y: 130 - timeHeight } });
    
        // Animate text values and their positions
        
        // Processed Files
        gsap.to({ val: parseFloat(valueProcessed.textContent || '0') }, {
            ...animationConfig,
            val: stats.processed,
            snap: { val: 1 },
            onUpdate: function() { valueProcessed.textContent = this.targets()[0].val; }
        });
        gsap.to(valueProcessed, { ...animationConfig, attr: { y: 125 - processedHeight }});
    
        // Errors
        gsap.to({ val: parseFloat(valueErrors.textContent || '0') }, {
            ...animationConfig,
            val: stats.errors,
            snap: { val: 1 },
            onUpdate: function() { valueErrors.textContent = this.targets()[0].val; }
        });
        gsap.to(valueErrors, { ...animationConfig, attr: { y: 125 - errorsHeight }});
        
        // Time
        gsap.to({ val: parseFloat(valueTime.textContent || '0') }, {
            ...animationConfig,
            val: stats.time,
            onUpdate: function() { valueTime.textContent = this.targets()[0].val.toFixed(2) + 's'; }
        });
        gsap.to(valueTime, { ...animationConfig, attr: { y: 125 - timeHeight }});
    }

    private initSvgVisuals() {
        this.svgCoreElements = gsap.utils.toArray('.svg-core-element');
        this.svgCoreRings = gsap.utils.toArray('.svg-core-ring');
        this.svgCircuitLines = gsap.utils.toArray('.svg-circuit-line');
        this.svgNodes = gsap.utils.toArray('.svg-node');
        this.lightningElement = document.getElementById('lightning') as unknown as SVGElement | null;
    
        gsap.set([...this.svgCoreRings, ...this.svgNodes], { transformOrigin: 'center center' });
    
        this.coreAnimation = gsap.timeline({ repeat: -1, yoyo: true });
    
        this.coreAnimation.to(this.svgCoreRings, {
            rotation: (i) => (i % 2 === 0 ? -90 : 90), // rotate alternating directions
            duration: 10,
            stagger: 0.5,
            ease: 'power1.inOut'
        });
    
        this.svgCircuitLines.forEach(line => {
            const length = line.getTotalLength ? line.getTotalLength() : 200;
            gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
            this.coreAnimation.to(line, {
                strokeDashoffset: 0,
                duration: 5,
                ease: 'power1.inOut'
            }, "<");
        });
    
        this.coreAnimation.to(this.svgNodes, {
            scale: 1.5,
            opacity: 0.5,
            duration: 2,
            stagger: {
                each: 0.1,
                from: 'center'
            },
            ease: 'power1.inOut'
        }, "<");
    
        this.triggerLightning();
    }

    private triggerLightning() {
        if (!this.lightningElement) return;
        const startPoint = { x: gsap.utils.random(50, 430), y: gsap.utils.random(50, 250) };
        const endPoint = { x: gsap.utils.random(50, 430), y: gsap.utils.random(50, 250) };
        let points = `${startPoint.x},${startPoint.y} `;
        const segments = gsap.utils.random(3, 6);
        for(let i=0; i < segments; i++) {
            points += `${gsap.utils.random(startPoint.x, endPoint.x)},${gsap.utils