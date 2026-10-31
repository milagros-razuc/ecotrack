#include <cassert>

class PortalTimeoutState {
 public:
  explicit PortalTimeoutState(unsigned long timeout) : timeout_(timeout) {}

  void start(unsigned long now) {
    active_ = true;
    lastActivity_ = now;
  }

  void markActivity(unsigned long now) {
    if (active_) lastActivity_ = now;
  }

  bool expire(unsigned long now) {
    if (!active_ ||
        static_cast<unsigned long>(now - lastActivity_) < timeout_) {
      return false;
    }
    active_ = false;
    return true;
  }

  bool active() const { return active_; }

 private:
  const unsigned long timeout_;
  unsigned long lastActivity_ = 0;
  bool active_ = false;
};

int main() {
  PortalTimeoutState portal(600000);
  portal.start(1000);
  assert(!portal.expire(600999));
  assert(portal.active());
  portal.markActivity(599000);
  assert(!portal.expire(1198999));
  assert(portal.expire(1199000));
  assert(!portal.active());
  return 0;
}
