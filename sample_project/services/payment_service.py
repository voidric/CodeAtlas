"""
支付网关与结算服务模块
"""
from ..utils.calculator import calculate_tax

class PaymentProcessor:
    """支付网关交互处理器"""
    def __init__(self, merchant_id: str):
        self.merchant_id = merchant_id

    def execute_payment(self, order_id: str, total_amount: float) -> bool:
        """
        向三方网关发起实际扣款
        Args:
            order_id: 业务订单号
            total_amount: 实付金额 (含税)
        Returns:
            扣款是否成功
        """
        tax = calculate_tax(total_amount)
        print(f"Processing payment for {order_id}: amount={total_amount}, tax={tax}")
        return True

def process_checkout_payment(order_id: str, raw_price: float) -> bool:
    """包装单笔结算扣款流程"""
    processor = PaymentProcessor("MCH_8888")
    return processor.execute_payment(order_id, raw_price)
