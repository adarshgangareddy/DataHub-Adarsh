import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted">That address does not exist.</p>
      <Link to="/dashboard" className="mt-4 inline-block text-steel underline underline-offset-2">
        Back to the dashboard
      </Link>
    </div>
  );
}
