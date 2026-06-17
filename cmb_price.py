import tushare as ts
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime, timedelta
import os

# 设置 tushare token（如果环境变量中没有，则提示用户输入）
token = os.environ.get('TUSHARE_TOKEN')
if not token:
    token = input("请输入你的 tushare token: ")
ts.set_token(token)

# 获取招商银行（600036.SH）的日线数据
pro = ts.pro_bank()
# 获取最近三个月的数据
end_date = datetime.now().strftime('%Y%m%d')
start_date = (datetime.now() - timedelta(days=90)).strftime('%Y%m%d')

# 使用 pro_bar 获取前复权数据
df = ts.pro_bar(ts_code='600036.SH', adj='qfq', start_date=start_date, end_date=end_date)

if df is None or df.empty:
    print("未获取到数据，请检查 token 或网络连接。")
else:
    # 按日期排序
    df = df.sort_values('trade_date')
    df['trade_date'] = pd.to_datetime(df['trade_date'])
    
    # 绘制收盘价走势图
    plt.figure(figsize=(12, 6))
    plt.plot(df['trade_date'], df['close'], marker='o', linestyle='-', linewidth=2, markersize=4)
    plt.title('招商银行 (600036.SH) 近期价格走势', fontsize=16)
    plt.xlabel('日期', fontsize=12)
    plt.ylabel('收盘价 (元)', fontsize=12)
    plt.grid(True, linestyle='--', alpha=0.7)
    plt.gca().xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
    plt.gca().xaxis.set_major_locator(mdates.WeekdayLocator(interval=2))
    plt.xticks(rotation=45)
    plt.tight_layout()
    
    # 保存图表
    plt.savefig('cmb_price_trend.png', dpi=300, bbox_inches='tight')
    print("图表已保存为 cmb_price_trend.png")
    
    # 显示数据摘要
    print("\n数据摘要:")
    print(f"时间范围: {df['trade_date'].min().strftime('%Y-%m-%d')} 至 {df['trade_date'].max().strftime('%Y-%m-%d')}")
    print(f"最高价: {df['high'].max():.2f} 元")
    print(f"最低价: {df['low'].min():.2f} 元")
    print(f"最新收盘价: {df['close'].iloc[-1]:.2f} 元")
    print(f"涨跌幅: {((df['close'].iloc[-1] - df['close'].iloc[0]) / df['close'].iloc[0] * 100):.2f}%")
    
    # 显示最近5天的数据
    print("\n最近5个交易日数据:")
    recent = df.tail()[['trade_date', 'open', 'high', 'low', 'close', 'vol']]
    recent['trade_date'] = recent['trade_date'].dt.strftime('%Y-%m-%d')
    print(recent.to_string(index=False))