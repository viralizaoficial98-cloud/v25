import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Tickets } from '../Tickets';
import { EventInfo } from '../EventInfo';
import { Countdown } from '../Countdown';

// Sem VITE_SUPABASE_* nos testes: o site deve mostrar estados honestos, sem simular vendas.
describe('secções públicas sem backend configurado', () => {
  it('ingressos mostram A AGUARDAR ABERTURA DAS VENDAS e nenhum botão de compra', async () => {
    render(<MemoryRouter><Tickets /></MemoryRouter>);
    expect(await screen.findByText('A AGUARDAR ABERTURA DAS VENDAS')).toBeInTheDocument();
    expect(screen.queryByText(/comprar ingresso/i)).not.toBeInTheDocument();
  });
  it('informações do evento com data, hora, local e link para o Google Maps', () => {
    render(<EventInfo />);
    expect(screen.getByText('20 de Dezembro de 2026')).toBeInTheDocument();
    expect(screen.getByText('16h00')).toBeInTheDocument();
    expect(screen.getByText('Hotel Brisa Tropical')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /ver localização/i });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/search\//);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
  it('contagem regressiva acessível', () => {
    render(<Countdown target="2099-01-01T00:00:00+01:00" />);
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });
});
