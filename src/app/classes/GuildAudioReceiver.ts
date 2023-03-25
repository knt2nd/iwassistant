import type { VoiceConnection } from '@discordjs/voice';
import { EndBehaviorType, VoiceConnectionStatus } from '@discordjs/voice';
import type { GuildMember, TextChannel, VoiceChannel } from 'discord.js';
import { Readable } from 'node:stream';
import { shortenId } from '../utils';
import { EventEmitter } from './EventEmitter';

function unsubscribe(connection: VoiceConnection): void {
  for (const subscription of connection.receiver.subscriptions.values()) {
    if (!subscription.destroyed) subscription.destroy();
  }
}

type Events = {
  debug: unknown[];
  create: [audio: RecognizableAudio<'guild'>];
};

export class GuildAudioReceiver extends EventEmitter<Events> {
  readonly #error: ErrorHandler;
  readonly #debug?: DebugHandler;
  readonly #bots: Map<string, true>;
  #enabled: boolean;
  #current: { connection: VoiceConnection; channel: VoiceChannel } | undefined;

  constructor(errorHandler: ErrorHandler, debug: boolean) {
    super(errorHandler);
    this.#error = errorHandler;
    if (debug) this.#debug = (...args) => this.emit('debug', ...args);
    this.#bots = new Map();
    this.#enabled = false;
  }

  get active(): boolean {
    return this.#enabled && !!this.#current;
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  enable(): void {
    this.#enabled = true;
  }

  disable(): void {
    this.#enabled = false;
    if (this.#current) unsubscribe(this.#current.connection);
  }

  subscribe(connection: VoiceConnection, channel: VoiceChannel): void {
    this.#reset();
    this.#current = { connection, channel };
    connection.once(VoiceConnectionStatus.Disconnected, this.#onDisconnected);
    connection.receiver.speaking.on('start', this.#onSpeakingStart);
  }

  #reset(): void {
    if (!this.#current) return;
    const { connection, channel } = this.#current;
    this.#debug?.(`[AR:${shortenId(channel.id)}] Reset`);
    this.#current = undefined;
    connection.receiver.speaking.off('start', this.#onSpeakingStart);
    unsubscribe(connection);
  }

  #onDisconnected = (): void => {
    this.#reset();
  };

  #onSpeakingStart = (userId: string): void => {
    if (!this.#current || !this.#enabled) return;
    const { connection, channel } = this.#current;
    if (this.#bots.has(userId) || connection.receiver.subscriptions.has(userId)) return;
    const member = channel.members.get(userId); // should fetch? :thinking:
    if (!member) return;
    if (member.user.bot) return void this.#bots.set(userId, true);
    this.#debug?.(`[AR:${shortenId(channel.id)}] Subscribe ${userId}`);
    const subscription = connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.Manual } });
    const creator = new VoiceAudioCreator(member, channel, this.#error, this.#debug);
    creator.on('create', (audio) => void this.emit('create', audio));
    subscription.on('data', (chunk: Buffer) => creator.push(chunk));
    subscription.once('close', () => this.#debug?.(`[AR:${shortenId(channel.id)}] Unsubscribe ${userId}`));
  };
}

class VoiceAudioCreator extends EventEmitter<Events> {
  readonly #error: ErrorHandler;
  readonly #debug?: DebugHandler;
  readonly #member: GuildMember;
  readonly #channel: VoiceChannel;
  #buffers: Buffer[];
  #endFrameTimes: number[];
  #resetTimer?: NodeJS.Timeout;
  #finishTimer?: NodeJS.Timeout;
  #audio: RecognizableAudio<'guild'> | undefined;

  constructor(member: GuildMember, channel: VoiceChannel, errorHandler: ErrorHandler, debugHandler?: DebugHandler) {
    super(errorHandler);
    this.#error = errorHandler;
    if (debugHandler) this.#debug = debugHandler;
    this.#member = member;
    this.#channel = channel;
    this.#buffers = [];
    this.#endFrameTimes = [];
  }

  push(chunk: Buffer): void {
    if (this.#audio) {
      clearTimeout(this.#finishTimer);
      this.#endFrameTimes.push(Date.now());
      if (this.#endFrameTimes.length > 10) this.#endFrameTimes.shift();
      if ((this.#endFrameTimes.at(-1) ?? 0) - (this.#endFrameTimes.at(0) ?? 0) > 1000) {
        this.#debug?.(`[AC:${shortenId(this.#member.id)}] End`);
        this.#finish();
        return;
      }
      // this.#debug?.(`[AC:${shortenId(this.#member.id)}] ${this.#audio.aborted ? '-' : '>'} ${chunk.length}`);
      if (!this.#audio.aborted) this.#audio.resource.push(chunk);
      this.#setFinishTimer();
      return;
    }
    clearTimeout(this.#resetTimer);
    // this.#debug?.(`[AC:${shortenId(this.#member.id)}] * ${this.#buffers.length} ${chunk.length}`);
    this.#buffers.push(chunk);
    if (this.#buffers.length < 50) {
      this.#resetTimer = setTimeout(() => {
        this.#debug?.(`[AC:${shortenId(this.#member.id)}] Reset`);
        this.#buffers = [];
      }, 300);
      return;
    }
    this.#audio = new RecognizableAudioImpl(this.#member, this.#channel, this.#error);
    for (const buffer of this.#buffers) {
      this.#audio.resource.push(buffer);
    }
    this.#buffers = [];
    this.#debug?.(`[AC:${shortenId(this.#member.id)}] Create: ${this.#audio.resource.readableLength}`);
    this.emit('create', this.#audio);
    this.#setFinishTimer();
  }

  #finish(): void {
    if (!this.#audio?.aborted) this.#audio?.resource.push(null);
    this.#audio = undefined;
    this.#endFrameTimes = [];
    this.#debug?.(`[AC:${shortenId(this.#member.id)}] Finish`);
  }

  #setFinishTimer(): void {
    this.#finishTimer = setTimeout(() => this.#finish(), 1000);
  }
}

class RecognizableAudioImpl extends EventEmitter<{ end: []; abort: [] }> implements RecognizableAudio<'guild'> {
  readonly type = 'guild';
  readonly member: GuildMember;
  readonly channel: VoiceChannel;
  destination: TextChannel | VoiceChannel;
  readonly resource: Readable;
  readonly results: string[];
  transcript: string;
  aborted: boolean;

  constructor(member: GuildMember, channel: VoiceChannel, errorHandler: ErrorHandler) {
    super(errorHandler);
    this.member = member;
    this.channel = channel;
    this.destination = channel;
    this.resource = new Readable({ read: () => {} });
    this.results = [];
    this.transcript = '';
    this.aborted = false;
    this.on('end', () => void (this.transcript = this.results.join('\n')));
  }

  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    this.emit('abort');
  }
}
