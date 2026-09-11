'use client';

export const MASKED_MONEY_PLACEHOLDER = '₦••••••';

export function MaskedMoney({
  value,
  visible,
  className,
  placeholder = MASKED_MONEY_PLACEHOLDER,
}: {
  value: string;
  visible: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <span className={className}>
      <span className={visible ? 'hidden' : 'inline print:hidden select-none tracking-[0.14em]'} aria-hidden="true">
        {placeholder}
      </span>
      <span className={visible ? 'inline' : 'hidden print:inline'}>{value}</span>
    </span>
  );
}
