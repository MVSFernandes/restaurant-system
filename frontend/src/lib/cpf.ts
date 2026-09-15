const digitsOnly = (value?: string | null) => String(value ?? '').replace(/\D/g, '');

export const formatCpf = (value?: string | null) => {
  const digits = digitsOnly(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export const isValidCpf = (value?: string | null) => {
  const cpf = digitsOnly(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length: number) => {
    const sum = cpf
      .slice(0, length)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
};

export const isValidCnpj = (value?: string | null) => {
  const cnpj = digitsOnly(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (length: number) => {
    let weight = length - 7;
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(cnpj[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    return sum % 11 < 2 ? 0 : 11 - sum % 11;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
};

export const isValidConsumerDocument = (value: string) => isValidCpf(value) || isValidCnpj(value);

export const formatConsumerDocument = (value: string) => {
  const digits = digitsOnly(value).slice(0, 14);
  if (digits.length <= 11) return formatCpf(digits);
  return digits.replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};
