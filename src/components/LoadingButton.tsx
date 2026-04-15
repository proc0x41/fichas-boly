import { type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
}

const variants = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 disabled:bg-primary-300',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
}

export function LoadingButton({ loading, variant = 'primary', children, className = '', ...props }: Props) {
  return (
    <button
      className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}
