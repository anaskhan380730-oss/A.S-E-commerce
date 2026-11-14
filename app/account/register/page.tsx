import CustomerAuthForm from '@/components/customer-auth-form';

function localReturnTo(value?: string | string[]) {
  const path = Array.isArray(value) ? value[0] : value;
  return path?.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path : '/account/profile';
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const params = await searchParams;
  return <CustomerAuthForm mode="register" returnTo={localReturnTo(params.returnTo)} />;
}
