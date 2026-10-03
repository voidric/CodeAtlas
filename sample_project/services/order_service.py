"""
订单业务流聚合服务
"""
from ..models import User, Order
from ..utils.calculator import calculate_discount
from .payment_service import process_checkout_payment

def checkout_order(user_id: str, email: str, base_amount: float) -> dict:
    """
    用户下单与结算端到端业务主链路
    包含实例化用户模型、计算折扣、实例化订单、发起支付、确认订单状态
    Args:
        user_id: 客户唯一标识
        email: 客户通知邮箱
        base_amount: 商品原价
    Returns:
        包含订单ID和最终状态的字典
    """
    user = User(user_id=user_id, username=f"User_{user_id}", email=email)
    if not user.validate_email():
        return {"error": "Invalid email address"}

    final_price = calculate_discount(base_amount, 0.15)
    order = Order(order_id=f"ORD_{user_id}_1001", user=user, amount=final_price)

    is_success = process_checkout_payment(order.get_id(), final_price)
    if is_success:
        result = order.mark_as_paid()
        return result

    return {"error": "Payment failed"}
