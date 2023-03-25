class EventEmitter {
  #events = new Map();

  on(eventName, listener) {
    this.#events.set(eventName, listener);
  }

  emit(eventName, ...args) {
    this.#events.get(eventName)?.(...args);
  }
}

class WebSocketClient extends EventEmitter {
  #ws = new WebSocket(`ws://${location.host}`);

  constructor() {
    super();
    this.#ws.binaryType = 'arraybuffer';
    this.#ws.onerror = console.error;
    this.#ws.onclose = () => this.emit('close');
    this.#ws.onmessage = (event) => this.emit('message', event.data);
  }

  send(...args) {
    this.#ws.send(args.join('\t'));
  }
}

class AudioPlayer extends EventEmitter {
  #context = new AudioContext();
  #destination = this.#context.createMediaStreamDestination();
  #scheduledTime = 0;
  #fixed = false;
  #sources = [];

  get stream() {
    return this.#destination.stream;
  }

  play(chunk) {
    if (this.#fixed || !chunk || chunk.constructor !== ArrayBuffer || chunk.byteLength === 0) return;
    const data = new Float32Array(chunk);
    const buffer = this.#context.createBuffer(1, data.length, 48_000);
    const source = this.#context.createBufferSource();
    buffer.getChannelData(0).set(data);
    source.buffer = buffer;
    source.connect(this.#destination);
    source.onended = () => {
      if (this.#sources.length === 0) return;
      this.#sources.shift();
      if (this.#fixed && this.#sources.length === 0) {
        this.#fixed = false;
        this.emit('end');
      }
    };
    this.#sources.push(source);
    const currentTime = this.#context.currentTime;
    if (currentTime < this.#scheduledTime) {
      source.start(this.#scheduledTime);
      this.#scheduledTime += buffer.duration;
    } else {
      source.start(currentTime);
      this.#scheduledTime = currentTime + buffer.duration;
    }
  }

  stop() {
    this.#fixed = false;
    if (this.#sources.length === 0) return;
    const sources = this.#sources;
    this.#sources = [];
    for (const source of sources) {
      source.stop();
    }
    this.emit('end');
  }

  fix() {
    if (this.#sources.length === 0) {
      this.emit('end');
    } else {
      this.#fixed = true;
    }
  }
}

class SpeechToText extends EventEmitter {
  #engine = new webkitSpeechRecognition();
  #active = false;
  #started = false;
  #finishTimer;

  constructor() {
    super();
    this.#engine.onstart = () => {
      if (this.#started || !this.#active) return;
      this.#started = true;
      this.emit('start');
    };
    this.#engine.onend = () => {
      clearTimeout(this.#finishTimer);
      if (!this.#active) return this.emit('stop');
      this.#engine.start();
    };
    this.#engine.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript.length === 0) return;
      const isFinal = event.results[event.results.length - 1].isFinal;
      this.emit('result', transcript, isFinal);
    };
    this.#engine.onerror = (event) => {
      this.stop(true);
      this.emit('error', event.error);
    };
  }

  start(voice, interim) {
    this.#active = true;
    this.#started = false;
    this.#engine.lang = voice;
    this.#engine.interimResults = interim;
    this.#engine.start();
  }

  stop(immediate = false) {
    this.#active = false;
    if (immediate) {
      this.#engine.stop();
    } else {
      this.#finishTimer = setTimeout(() => this.#engine.stop(), 1000);
    }
  }
}

async function setupChrome(stream) {
  const audio = document.createElement('audio');
  const select = document.createElement('select');
  const button = document.createElement('button');
  const allDevices = await navigator.mediaDevices.enumerateDevices();
  const devices = allDevices.filter((d) => d.kind === 'audiooutput').map((d) => ({ id: d.deviceId, label: d.label }));
  for (const device of devices) {
    const option = document.createElement('option');
    option.value = device.id;
    option.text = device.label;
    select.add(option);
  }
  const hash = decodeURI(location.hash.slice(1));
  const deviceId = localStorage.getItem('deviceId') ?? devices.find((d) => d.label === hash)?.id;
  if (deviceId && devices.some((d) => d.id === deviceId)) {
    select.value = deviceId;
    await audio.setSinkId(deviceId).catch(console.error);
  }
  select.onchange = () => {
    audio
      .setSinkId(select.value)
      .then(() => localStorage.setItem('deviceId', select.value))
      .catch(console.error);
  };
  button.onclick = () => {
    const audio = new Audio(`http://${location.host}/sample`);
    audio
      .setSinkId(select.value)
      .then(() => audio.play())
      .catch(console.error);
  };
  button.textContent = 'TEST';
  document.body.append(select);
  document.body.append(button);
  audio.srcObject = stream;
  audio.play();
  console.log('Devices:', allDevices);
  return devices.map((d) => `${d.id === select.value ? '*' : '-'} ${d.label}`).join('\n');
}

async function main() {
  const player = new AudioPlayer();
  const stt = new SpeechToText();
  const ws = new WebSocketClient();
  player.on('end', () => stt.stop());
  stt.on('start', () => ws.send('start'));
  stt.on('stop', () => ws.send('stop'));
  stt.on('result', (transcript, isFinal) => ws.send('result', isFinal ? '1' : '0', transcript));
  stt.on('error', (error) => {
    player.stop();
    if (error !== 'no-speech') ws.send('error', `Chrome STT: ${error}`);
  });
  ws.on('close', () => window.close());
  ws.on('message', (data) => {
    if (data.constructor === ArrayBuffer) return player.play(data);
    const [name, ...args] = data.split('\t');
    switch (name) {
      case 'start': {
        if (args[1]) stt.start(args[1], args[0] === '1');
        break;
      }
      case 'stop': {
        stt.stop(true);
        player.stop();
        break;
      }
      case 'fix': {
        player.fix();
        break;
      }
    }
  });
  const report = await setupChrome(player.stream);
  ws.send('ready', report);
}

window.onload = () => void Promise.resolve().then(main).catch(console.error);
