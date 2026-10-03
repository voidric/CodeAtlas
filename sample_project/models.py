"""
用户与订单核心数据实体模块
"""
from typing import Optional, List
from datetime import datetime

class BaseEntity:
    """系统实体基础抽象类"""
    def __init__(self, entity_id: str):
        """
        初始化实体ID
        Args:
            entity_id: 实体全局唯一标识符
        """
        self.entity_id = entity_id
        self.created_at = datetime.now()

    def get_id(self) -> str:
        """获取当前实体的唯一标识"""
        return self.entity_id

class User(BaseEntity):
    """系统用户模型"""
    def __init__(self, user_id: str, username: str, email: str, is_active: bool = True):
        """
        用户模型初始化
        Args:
            user_id: 用户唯一标识
            username: 用户名
            email: 用户电子邮箱
            is_active: 账号是否激活
        """
        super().__init__(user_id)
        self.username = username
        self.email = email
        self.is_active = is_active

    def validate_email(self) -> bool:
        """验证用户邮箱格式是否有效"""
        return "@" in self.email and "." in self.email

    def deactivate(self) -> None:
        """停用该用户账户"""
        self.is_active = False

class Order(BaseEntity):
    """订单实体"""
    def __init__(self, order_id: str, user: User, amount: float, items: Optional[List[str]] = None):
        """
        订单初始化
        Args:
            order_id: 订单号
            user: 所属用户对象
            amount: 订单金额
            items: 商品列表
        """
        super().__init__(order_id)
        self.user = user
        self.amount = amount
        self.items = items or []
        self.status = "PENDING"

    def mark_as_paid(self) -> dict:
        """将订单标记为已支付并返回状态"""
        self.status = "PAID"
        return {"order_id": self.entity_id, "status": self.status}
