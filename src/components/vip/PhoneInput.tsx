import { useMemo } from 'react';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';
import { Input, Select } from '@/components/ui/field';

const PRIORITY: CountryCode[] = ['AO', 'PT', 'BR', 'MZ', 'CV', 'ST', 'NA', 'ZA', 'GB', 'FR', 'US', 'CH', 'DE', 'NL', 'BE', 'LU', 'CA'];

export function useCountries() {
  return useMemo(() => {
    const names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['pt-PT'], { type: 'region' }) : null;
    const label = (c: CountryCode) => `${names?.of(c) ?? c} (+${getCountryCallingCode(c)})`;
    const rest = getCountries().filter((c) => !PRIORITY.includes(c)).sort((a, b) => label(a).localeCompare(label(b), 'pt'));
    return [...PRIORITY, ...rest].map((c) => ({ code: c, label: label(c) }));
  }, []);
}

/** Telefone com indicativo (Angola +244 por omissão). */
export function PhoneInput({
  id,
  describedBy,
  country,
  onCountry,
  value,
  onChange,
  invalid,
}: {
  id: string;
  describedBy?: string;
  country: CountryCode;
  onCountry: (c: CountryCode) => void;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const countries = useCountries();
  return (
    <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-2">
      <Select aria-label="Indicativo do país" value={country} onChange={(e) => onCountry(e.target.value as CountryCode)}>
        {countries.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </Select>
      <Input id={id} aria-describedby={describedBy} type="tel" autoComplete="tel-national" inputMode="tel" placeholder={country === 'AO' ? '9XX XXX XXX' : ''}
        value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid} />
    </div>
  );
}
