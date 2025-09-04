
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GdmLiveAudioVisuals3D } from './visual-3d';
import { gsap } from 'gsap';

class AiGuiApp {
    private sidebarButtons: NodeListOf<HTMLButtonElement>;
    private contentPanels: NodeListOf<HTMLDivElement>;
    private logContent: HTMLElement;
    private geminiRunBtn: HTMLButtonElement;
    private geminiSpinner: HTMLElement;
    private geminiPrompt: HTMLTextAreaElement;
    private geminiResponse: HTMLElement;
    private geminiSearchToggle: HTMLInputElement;
    private geminiSourcesContainer: HTMLElement;
    private geminiSourcesList: HTMLElement;
    private executeButtons: NodeListOf<HTMLButtonElement>;
    
    private ai: GoogleGenAI | null = null;
    private isLoading = false;
    private currentMode = 'gemini';
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private visualizerElement: GdmLiveAudioVisuals3D | null = null;
    private analyserNode: AnalyserNode | null = null;
    private audioDataArray: Uint8Array | null = null;
    private audioTimeDomainArray: Uint8Array | null = null; // For waveform
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
    private ghostingSensorToggle: HTMLInputElement;
    private sensorModeLabel: HTMLElement;
    private ghostingMetersAnimation: gsap.core.Timeline | null = null;
    
    // New properties from script adaptation
    private analyzerInput: HTMLInputElement;
    private analyzerOutput: HTMLElement;
    private analyzerOutputContainer: HTMLElement;
    private promptTokenCount: HTMLElement;
    private promptProcessingTier: HTMLElement;
    private statusGrid: HTMLElement;

    // 2D Waveform properties
    private waveformCanvas: HTMLCanvasElement | null = null;
    private waveformCtx: CanvasRenderingContext2D | null = null;

    // Bitcoin Entropy Panel properties
    private bitcoinTimestampInterval: number | null = null;
    private bitcoinCanvasInterval: number | null = null;
    private boundDrawBitcoinVisualization = this.drawBitcoinEntropyVisualization.bind(this);


    constructor() {
        this.sidebarButtons = document.querySelectorAll('#sidebar .nav-link');
        this.contentPanels = document.querySelectorAll('.content-panel');
        this.logContent = document.getElementById('log-content')!;
        this.geminiRunBtn = document.getElementById('gemini-run') as HTMLButtonElement;
        this.geminiSpinner = document.getElementById('gemini-spinner')!;
        this.geminiPrompt = document.getElementById('gemini-prompt') as HTMLTextAreaElement;
        this.geminiResponse = document.getElementById('gemini-response')!;
        this.geminiSearchToggle = document.getElementById('gemini-search-toggle') as HTMLInputElement;
        this.geminiSourcesContainer = document.getElementById('gemini-sources') as HTMLElement;
        this.geminiSourcesList = document.getElementById('gemini-sources-list') as HTMLElement;
        this.executeButtons = document.querySelectorAll('.execute-btn');
        this.colorRadios = document.querySelectorAll('input[name="color"]');
        this.speedRadios = document.querySelectorAll('input[name="speed"]');

        // Ghosting Protocol Elements
        this.captureEchoBtn = document.getElementById('capture-echo-btn') as HTMLButtonElement;
        this.holdDurationSlider = document.getElementById('hold-duration-slider') as HTMLInputElement;
        this.holdDurationValue = document.getElementById('hold-duration-value')!;
        this.echoAnalysisOutput = document.getElementById('echo-analysis-output')!;
        this.ghostingSensorToggle = document.getElementById('ghosting-sensor-toggle') as HTMLInputElement;
        this.sensorModeLabel = document.getElementById('sensor-mode-label') as HTMLElement;

        // New Elements
        this.analyzerInput = document.getElementById('analyzer-input') as HTMLInputElement;
        this.analyzerOutput = document.getElementById('analyzer-output')!;
        this.analyzerOutputContainer = document.getElementById('analyzer-output-container')!;
        this.promptTokenCount = document.getElementById('prompt-token-count')!;
        this.promptProcessingTier = document.getElementById('prompt-processing-tier')!;
        this.statusGrid = document.getElementById('status-grid')!;
        
        // 2D Waveform
        this.waveformCanvas = document.getElementById('waveform-canvas') as HTMLCanvasElement;
        this.waveformCtx = this.waveformCanvas?.getContext('2d') || null;

        this.init();
    }

    private init() {
        this.log('info', 'AI Core Engine GUI Initialized.');
        try {
            this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            this.log('success', 'Gemini API client initialized successfully.');
        } catch (error) {
            this.log('error', `Failed to initialize Gemini API: ${(error as Error).message}`);
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

        this.geminiRunBtn.addEventListener('click', () => this.handleGeminiRunClick());
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
        this.ghostingSensorToggle.addEventListener('change', () => this.handleSensorModeChange());
    }
    
    private clearLog() {
        this.logContent.innerHTML = '';
    }

    private switchMode(mode: string) {
        if (this.currentMode === mode) return;

        // Stop mode-specific animations/intervals
        if (this.currentMode === 'visualizer' && this.mediaStream) {
            this.stopSvgAudioReaction();
        }
        if (this.currentMode === 'bitcoin') {
            this.stopBitcoinPanel();
        }
        if (this.currentMode === 'ghosting') {
            this.stopGhostingMeters();
        }

        this.log('info', `Switching to mode: ${mode}`);
        this.currentMode = mode;
        
        this.sidebarButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.mode === mode);
        });

        this.contentPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `panel-${mode}`);
        });

        // Initialize mode-specific functionality
        if (mode === 'visualizer') {
            this.initAudioVisualizer();
        }
        if (mode === 'status') {
            this.updateSystemStatus();
        }
        if (mode === 'bitcoin') {
            this.initBitcoinPanel();
        }
        if (mode === 'ghosting') {
            this.startGhostingMeters();
        }
    }

    private async initAudioVisualizer() {
        if (this.mediaStream) { // Already initialized, just restart reaction
             this.startSvgAudioReaction();
             return;
        }

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
            
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 512;
            const bufferLength = this.analyserNode.frequencyBinCount;
            this.audioDataArray = new Uint8Array(bufferLength);
            this.audioTimeDomainArray = new Uint8Array(this.analyserNode.fftSize);
            source.connect(this.analyserNode);

            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = 0;
            this.analyserNode.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            this.visualizerElement.inputNode = source;
            this.visualizerElement.outputNode = gainNode;

            this.startSvgAudioReaction();

        } catch (err) {
            const errorMessage = `Could not get microphone access: ${(err as Error).message}`;
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

    private handleGeminiRunClick() {
        const prompt = this.geminiPrompt.value.trim();
        if (!prompt) {
            this.log('warn', 'Prompt is empty. Please enter a prompt.');
            this.geminiPrompt.classList.add('is-invalid');
            setTimeout(() => this.geminiPrompt.classList.remove('is-invalid'), 500);
            return;
        }
        this.runGeminiPrompt(prompt);
    }
    
    private async runGeminiPrompt(prompt: string) {
        if (!this.ai || this.isLoading) return;

        this.log('info', `Executing prompt on gemini-2.5-flash...`);
        this.isLoading = true;
        this.geminiRunBtn.disabled = true;
        this.geminiSpinner.style.display = 'block';
        this.geminiResponse.textContent = '';
        this.geminiSourcesContainer.style.display = 'none';
        this.geminiSourcesList.innerHTML = '';
        
        try {
            const useSearch = this.geminiSearchToggle.checked;
            const config = useSearch ? { tools: [{googleSearch: {}}] } : {};

            const responseStream = await this.ai.models.generateContentStream({
                model: "gemini-2.5-flash",
                contents: prompt,
                ... (useSearch && { config })
            });

            let finalResponse: GenerateContentResponse | null = null;
            for await (const chunk of responseStream) {
                this.geminiResponse.textContent += chunk.text;
                finalResponse = chunk; // last chunk has aggregated data
            }

            if (finalResponse) {
                this.displayGroundingSources(finalResponse);
            }
            this.log('success', 'Gemini prompt executed successfully.');

        } catch (error) {
            const errorMessage = `Error executing Gemini prompt: ${(error as Error).message}`;
            this.log('error', errorMessage);
            this.geminiResponse.textContent = errorMessage;
        } finally {
            this.isLoading = false;
            this.geminiRunBtn.disabled = false;
            this.geminiSpinner.style.display = 'none';
        }
    }
    
    private displayGroundingSources(response: GenerateContentResponse) {
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        const sources = groundingMetadata?.groundingChunks;

        if (sources && sources.length > 0) {
            this.log('info', `Found ${sources.length} grounding sources.`);
            this.geminiSourcesList.innerHTML = '';
            sources.forEach((source: any) => {
                if (source.web) {
                    const link = document.createElement('a');
                    link.href = source.web.uri;
                    link.textContent = source.web.title || source.web.uri;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.className = 'source-link';
                    this.geminiSourcesList.appendChild(link);
                }
            });
            this.geminiSourcesContainer.style.display = 'block';
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
            onUpdate: function() { valueProcessed.textContent = (this.targets()[0] as any).val; }
        });
        gsap.to(valueProcessed, { ...animationConfig, attr: { y: 125 - processedHeight }});
    
        // Errors
        gsap.to({ val: parseFloat(valueErrors.textContent || '0') }, {
            ...animationConfig,
            val: stats.errors,
            snap: { val: 1 },
            onUpdate: function() { valueErrors.textContent = (this.targets()[0] as any).val; }
        });
        gsap.to(valueErrors, { ...animationConfig, attr: { y: 125 - errorsHeight }});
        
        // Time
        gsap.to({ val: parseFloat(valueTime.textContent || '0') }, {
            ...animationConfig,
            val: stats.time,
            onUpdate: function() { valueTime.textContent = (this.targets()[0] as any).val.toFixed(2) + 's'; }
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
            points += `${gsap.utils.random(startPoint.x, endPoint.x)},${gsap.utils.random(startPoint.y, endPoint.y)} `;
        }
        points += `${endPoint.x},${endPoint.y}`;

        gsap.set(this.lightningElement, {
            attr: { points },
            opacity: 1,
            'stroke-width': gsap.utils.random(1, 3)
        });

        gsap.to(this.lightningElement, {
            opacity: 0,
            duration: 0.5,
            ease: 'power2.in',
            delay: 0.1
        });

        this.lightningDelayedCall = gsap.delayedCall(gsap.utils.random(2, 6), this.triggerLightning.bind(this));
    }

    private handleColorChange(event: Event) {
        const target = event.target as HTMLInputElement;
        const color = target.value;
        this.log('info', `Visualizer color changed to: ${color}`);
        const visualizerSvg = document.getElementById('core-visualizer-svg');
        if (visualizerSvg) {
            visualizerSvg.classList.remove('color-green', 'color-amber', 'color-ice');
            visualizerSvg.classList.add(`color-${color}`);
        }
    }
    
    private handleSpeedChange(event: Event) {
        const target = event.target as HTMLInputElement;
        const speed = parseFloat(target.value);
        this.log('info', `Visualizer speed changed to: ${speed}x`);
        if (this.coreAnimation) {
            this.coreAnimation.timeScale(speed);
        }
    }

    private captureEcho() {
        this.log('info', 'Capturing spectral echo...');
        this.echoAnalysisOutput.textContent = 'Analyzing...';
        
        setTimeout(() => {
            const success = Math.random() > 0.2;
            let resonance = (Math.random() * 100).toFixed(2);
            
            // Use live data if toggled and available
            if (this.ghostingSensorToggle.checked && this.analyserNode && this.audioDataArray) {
                this.analyserNode.getByteFrequencyData(this.audioDataArray);
                const avg = this.audioDataArray.reduce((s, v) => s + v, 0) / this.audioDataArray.length;
                resonance = (avg * 5).toFixed(2); // Map audio level to a resonance value
                this.log('info', 'Using live sensor data for echo resonance.');
            }

            if (success) {
                const signature = `SIG-${(Math.random() * 1e9).toString(36).toUpperCase()}`;
                this.echoAnalysisOutput.innerHTML = `
                    <p class="text-success">Echo Captured Successfully</p>
                    <p><strong>Signature:</strong> ${signature}</p>
                    <p><strong>Resonance Freq:</strong> ${resonance} Hz</p>
                `;
                this.log('success', `Echo captured with signature: ${signature}`);
            } else {
                this.echoAnalysisOutput.innerHTML = `<p class="text-danger">Capture Failed: Unstable Matrix</p>`;
                this.log('error', 'Failed to capture spectral echo.');
            }
        }, 1500);
    }
    
    private handleHoldDurationChange() {
        const duration = this.holdDurationSlider.value;
        this.holdDurationValue.textContent = `${duration}s`;
    }
    
    private handleSensorModeChange() {
        const isLive = this.ghostingSensorToggle.checked;
        this.sensorModeLabel.textContent = isLive ? 'Live' : 'Simulated';
        this.log('info', `Ghosting sensor mode set to ${isLive ? 'Live' : 'Simulated'}.`);
        if (isLive && !this.mediaStream) {
            this.log('warn', 'Live sensor mode requires microphone access. Please visit the Audio Visualizer panel to grant permission.');
        }
    }

    private updatePromptComplexity() {
        const prompt = this.geminiPrompt.value;
        const tokenCount = Math.round(prompt.length / 4); // Simple approximation
        this.promptTokenCount.textContent = `${tokenCount}`;

        let tier = 'Tier 1 (Simple)';
        if (tokenCount > 100) tier = 'Tier 2 (Moderate)';
        if (tokenCount > 500) tier = 'Tier 3 (Complex)';
        if (tokenCount > 1000) tier = 'Tier 4 (Advanced)';
        this.promptProcessingTier.textContent = tier;
    }

    private stopBitcoinPanel() {
        this.log('info', 'Stopping Bitcoin Entropy Panel updates.');
        if (this.bitcoinTimestampInterval) {
            clearInterval(this.bitcoinTimestampInterval);
            this.bitcoinTimestampInterval = null;
        }
        if (this.bitcoinCanvasInterval) {
            clearInterval(this.bitcoinCanvasInterval);
            this.bitcoinCanvasInterval = null;
        }
    }

    private stopSvgAudioReaction() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
            this.log('info', 'Audio visualizations stopped.');
        }
        this.isAudioReactive = false;
        // Reset any audio-reactive styles
        gsap.to(this.svgCoreElements, { scale: 1, opacity: 0.7, duration: 0.5 });
    }

    private updateSystemStatus() {
        this.log('info', 'Updating system status grid.');
        const statuses = {
            'API_ENDPOINT': 'ONLINE',
            'AUTH_SERVICE': 'ONLINE',
            'DATA_CACHE': 'DEGRADED',
            'VECTOR_DB': 'ONLINE',
            'LLM_GATEWAY': 'ONLINE',
            'JOB_QUEUE': 'ONLINE',
            'LOG_STREAM': 'ERROR',
            'MONITORING': 'ONLINE'
        };
        
        this.statusGrid.innerHTML = ''; // Clear previous statuses
        
        Object.entries(statuses).forEach(([service, status]) => {
            const statusItem = document.createElement('div');
            statusItem.className = 'status-item';
            
            const serviceName = document.createElement('span');
            serviceName.className = 'service-name';
            serviceName.textContent = service;
            
            const serviceStatus = document.createElement('span');
            serviceStatus.className = `service-status status-${status.toLowerCase()}`;
            serviceStatus.textContent = status;
            
            statusItem.appendChild(serviceName);
            statusItem.appendChild(serviceStatus);
            
            this.statusGrid.appendChild(statusItem);
        });
    }

    private initBitcoinPanel() {
        this.log('info', 'Initializing Bitcoin Entropy Panel.');
        this.stopBitcoinPanel(); // Ensure any previous intervals are cleared

        const timestampEl = document.getElementById('bitcoin-timestamp');
        const btcPriceEl = document.getElementById('btc-price');

        if (timestampEl) {
            this.bitcoinTimestampInterval = window.setInterval(() => {
                timestampEl.textContent = new Date().toISOString();
            }, 1000);
        }
        
        if (btcPriceEl) {
            // Dummy price update
            btcPriceEl.textContent = `$${(60000 + Math.random() * 5000).toFixed(2)}`;
        }

        this.bitcoinCanvasInterval = window.setInterval(this.boundDrawBitcoinVisualization, 200);
    }
    
    private startSvgAudioReaction() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.isAudioReactive = true;
        this.log('info', 'Audio visualizations started.');
        
        const animate = () => {
            if (!this.analyserNode || !this.audioDataArray || !this.isAudioReactive) {
                return;
            }

            this.analyserNode.getByteFrequencyData(this.audioDataArray);
            const average = this.audioDataArray.reduce((sum, value) => sum + value, 0) / this.audioDataArray.length;
            
            const scale = 1 + (average / 255) * 0.5;
            const opacity = 0.7 + (average / 255) * 0.3;
            
            gsap.to(this.svgCoreElements, {
                scale: scale,
                opacity: opacity,
                duration: 0.1,
                ease: 'power1.out'
            });
            
            this.drawWaveform();

            this.animationFrameId = requestAnimationFrame(animate);
        };

        animate();
    }
    
    private simulateTokenAnalysis() {
        const input = this.analyzerInput.value;
        if (!input) {
            this.analyzerOutput.textContent = 'Please enter text to analyze.';
            this.log('warn', 'Token analysis requested for empty input.');
            return;
        }

        this.log('info', `Analyzing tokens for input: "${input.substring(0, 30)}..."`);
        this.analyzerOutputContainer.classList.add('loading');
        this.analyzerOutput.textContent = '';
        
        setTimeout(() => {
            const tokens = input.split(/\s+/).filter(Boolean);
            const tokenCount = tokens.length;
            const charCount = input.length;
            const sentiment = Math.random() > 0.5 ? 'Positive' : 'Negative';

            this.analyzerOutput.innerHTML = `
                <p><strong>Tokens:</strong> ${tokenCount}</p>
                <p><strong>Characters:</strong> ${charCount}</p>
                <p><strong>Est. Sentiment:</strong> ${sentiment}</p>
                <p><strong>Entities Found:</strong> ${Math.floor(Math.random() * 5)}</p>
            `;
            this.analyzerOutputContainer.classList.remove('loading');
            this.log('success', 'Token analysis simulation complete.');
        }, 1200);
    }
    
    private drawBitcoinEntropyVisualization() {
        const canvas = document.getElementById('bitcoin-entropy-canvas') as HTMLCanvasElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = canvas;
        ctx.fillStyle = 'rgba(10, 25, 47, 0.1)';
        ctx.fillRect(0, 0, width, height);

        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = Math.random() * 3 + 1;
        const hue = 40 + Math.random() * 20; // Oranges and yellows

        ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.8)`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }

    private drawWaveform() {
        if (!this.waveformCtx || !this.waveformCanvas || !this.analyserNode || !this.audioTimeDomainArray) {
            return;
        }

        this.analyserNode.getByteTimeDomainData(this.audioTimeDomainArray);

        const { width, height } = this.waveformCanvas;
        this.waveformCtx.fillStyle = '#000';
        this.waveformCtx.fillRect(0, 0, width, height);

        this.waveformCtx.lineWidth = 2;
        this.waveformCtx.strokeStyle = 'rgb(0, 255, 156)';
        this.waveformCtx.beginPath();

        const sliceWidth = width * 1.0 / this.analyserNode.fftSize;
        let x = 0;

        for (let i = 0; i < this.analyserNode.fftSize; i++) {
            const v = this.audioTimeDomainArray[i] / 128.0;
            const y = v * height / 2;

            if (i === 0) {
                this.waveformCtx.moveTo(x, y);
            } else {
                this.waveformCtx.lineTo(x, y);
            }
            x += sliceWidth;
        }

        this.waveformCtx.lineTo(width, height / 2);
        this.waveformCtx.stroke();
    }
    
    private startGhostingMeters() {
        this.log('info', 'Initializing ghosting protocol meters.');
        this.ghostingMetersAnimation = gsap.timeline({ repeat: -1 });

        const needles = ['#meter-needle-1', '#meter-needle-2', '#meter-needle-3'];
        needles.forEach(needle => {
            this.ghostingMetersAnimation.to(needle, {
                rotation: () => gsap.utils.random(-80, 80),
                duration: () => gsap.utils.random(1, 3),
                ease: 'power1.inOut'
            }, 0);
        });
    }

    private stopGhostingMeters() {
        if (this.ghostingMetersAnimation) {
            this.ghostingMetersAnimation.kill();
            this.ghostingMetersAnimation = null;
            gsap.to('.meter-needle', { rotation: 0, duration: 0.5, ease: 'power1.out' });
            this.log('info', 'Ghosting protocol meters stopped.');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AiGuiApp();
});