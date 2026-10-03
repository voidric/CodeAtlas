"""
基础计算与费率工具函数库
"""

def calculate_discount(price: float, discount_rate: float = 0.1) -> float:
    """
    计算折后最终价格
    Args:
        price: 原始单价
        discount_rate: 折扣率 (0~1)
    Returns:
        折后价格
    """
    if discount_rate < 0 or discount_rate > 1:
        return price
    return price * (1.0 - discount_rate)

def calculate_tax(amount: float, tax_rate: float = 0.08) -> float:
    """计算指定金额的税额"""
    return amount * tax_rate

# 用于死函数检测测试：全项目无调用的孤立函数
def unused_legacy_formula(x: int, y: int) -> int:
    """废弃的历史计算公式，预期被 Dead Code Radar 检测出"""
    return (x * 42) + (y // 7)
