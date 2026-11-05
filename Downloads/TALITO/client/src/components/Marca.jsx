import { Link } from 'react-router-dom';

export default function Marca() {
  return (
    <Link className="marca" to="/menu" aria-label="TA'LITO, ir al menú">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
        <path d="M3 15h26a13 13 0 0 1-26 0z" fill="currentColor" />
        <path
          d="M11 10c0-2.4 2.2-2.4 2.2-4.8M18.6 10c0-2.4 2.2-2.4 2.2-4.8"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      <span>ta'lito</span>
    </Link>
  );
}
