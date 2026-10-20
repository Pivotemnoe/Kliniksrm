import { Statistic } from 'antd';
import type { StatisticProps } from 'antd';
import { formatMoneyValue, roundMoney } from '../utils/money';

type MoneyStatisticProps = Omit<StatisticProps, 'value' | 'formatter' | 'precision'> & { value?: number | string | null };

/** AntD's default precision truncates decimals and passes scientific notation through. */
export function MoneyStatistic({ value, suffix = '₽', ...props }: MoneyStatisticProps) {
  return <Statistic {...props} value={roundMoney(value)} formatter={() => formatMoneyValue(value)} suffix={suffix} />;
}
