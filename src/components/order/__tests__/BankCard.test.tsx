import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BankCard } from '../BankCard';

const base = {
  method: 'transferencia' as const, onMethod: () => {}, accountName: '27 LUAS COMUNICACAO E MARKETING SU LDA', bankName: '',
  accountNumber: '140065995 10 001', iban: 'AO06004000004006599510166', expressNumber: '920000000', amount: 25000, reference: 'V25-ABC234',
};

describe('cartão de pagamento', () => {
  it('dados validados: titular, conta, IBAN agrupado, valor e referência', () => {
    render(<BankCard {...base} confirmed />);
    expect(screen.getByText(base.accountName)).toBeInTheDocument();
    expect(screen.getByText('AO06 0040 0000 4006 5995 1016 6')).toBeInTheDocument();
    expect(screen.getByText('25 000 Kz')).toBeInTheDocument();
    expect(screen.getByText('V25-ABC234')).toBeInTheDocument();
    expect(screen.queryByText('Banco')).not.toBeInTheDocument(); // banco só se configurado
  });
  it('banco mostrado quando configurado pela organização', () => {
    render(<BankCard {...base} bankName="Banco Exemplo" confirmed />);
    expect(screen.getByText('Banco Exemplo')).toBeInTheDocument();
  });
  it('sem validação administrativa: não mostra coordenadas e avisa para não transferir', () => {
    render(<BankCard {...base} accountName="" accountNumber="" iban="" expressNumber="" confirmed={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Não efectue nenhuma transferência/);
    expect(screen.queryByText(/AO06/)).not.toBeInTheDocument();
  });
  it('sem número Express: só é oferecida a transferência bancária', () => {
    render(<BankCard {...base} expressNumber="" confirmed />);
    expect(screen.getByRole('tab', { name: /Transferência Bancária/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Transferência Express/ })).not.toBeInTheDocument();
  });
});
