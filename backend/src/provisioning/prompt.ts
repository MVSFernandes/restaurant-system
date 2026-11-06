/**
 * Leitura de senha com entrada oculta (nada é ecoado no terminal).
 *
 * Só funciona num terminal interativo: com entrada redirecionada (arquivo,
 * pipe, script) a leitura é recusada, para que a senha seja sempre digitada
 * no momento e nunca venha de um arquivo, argumento ou histórico do shell.
 */

export interface HiddenInput {
  isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
  resume(): unknown;
  pause(): unknown;
  setEncoding(encoding: BufferEncoding): unknown;
  on(event: 'data', listener: (chunk: string) => void): unknown;
  removeListener(event: 'data', listener: (chunk: string) => void): unknown;
}

export interface PromptOutput {
  write(text: string): unknown;
}

export class PromptAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptAbortedError';
  }
}

export function promptHidden(
  question: string,
  input: HiddenInput = process.stdin as unknown as HiddenInput,
  output: PromptOutput = process.stderr
): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new PromptAbortedError('A senha só pode ser digitada num terminal interativo (entrada redirecionada recusada).'));
  }
  output.write(question);
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error: Error | null) => {
      input.removeListener('data', onData);
      input.setRawMode!(false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish(null);
        if (char === '\u0003' || char === '\u0004') return finish(new PromptAbortedError('Entrada cancelada; nada foi gravado.'));
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    input.setRawMode!(true);
    input.setEncoding('utf8');
    input.resume();
    input.on('data', onData);
  });
}
