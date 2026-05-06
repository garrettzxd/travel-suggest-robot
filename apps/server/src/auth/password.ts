// bcrypt 密码 hash / 校验。所有用户密码必须经此模块处理，绝不直接写入 DB。
import bcrypt from "bcryptjs";

// rounds=10 是 bcryptjs 的安全 / 性能默认平衡点：登录耗时 ~50ms，攻击成本足够高。
const SALT_ROUNDS = 10;

/** 把明文密码转成 bcrypt hash，写入 users.passwordHash 列。 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** 校验明文密码是否匹配 bcrypt hash。错误密码不抛错，统一返回 false。 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
