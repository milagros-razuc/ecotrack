#include <cassert>
#include <iostream>

#include "../ReadingBuffer.h"

ReadingBufferEntry entry(uint32_t ts) {
  return {ts, static_cast<float>(ts), 47.0f, 65};
}

int main() {
  ReadingBuffer<3> buffer;
  assert(buffer.empty());
  assert(buffer.push(entry(1)));
  assert(buffer.push(entry(2)));
  assert(buffer.push(entry(3)));
  assert(buffer.full());

  ReadingBufferEntry front{};
  assert(buffer.peek(front));
  assert(front.ts == 1);
  assert(buffer.push(entry(4)));
  assert(buffer.size() == 3);
  assert(buffer.peek(front));
  assert(front.ts == 2);

  assert(buffer.discardFront());
  assert(buffer.peek(front));
  assert(front.ts == 3);
  assert(buffer.discardFront());
  assert(buffer.peek(front));
  assert(front.ts == 4);
  assert(buffer.discardFront());
  assert(buffer.empty());
  assert(!buffer.discardFront());

  ReadingBuffer<3> resetAfterRestart;
  assert(resetAfterRestart.empty());
  std::cout << "OK: FIFO, capacidad y reinicio" << std::endl;

  ReadingBuffer<360> largeBuffer;
  for (uint32_t ts = 1; ts <= 361; ++ts) {
    assert(largeBuffer.push(entry(ts)));
  }
  assert(largeBuffer.size() == 360);
  assert(largeBuffer.peek(front));
  assert(front.ts == 2);
  std::cout << "OK: capacidad 360 descarta la mas antigua" << std::endl;

  ReadingBuffer<3> wrappedBuffer;
  for (uint32_t ts = 1; ts <= 10; ++ts) {
    assert(wrappedBuffer.push(entry(ts)));
  }
  for (uint32_t expectedTs = 8; expectedTs <= 10; ++expectedTs) {
    assert(wrappedBuffer.peek(front));
    assert(front.ts == expectedTs);
    assert(wrappedBuffer.discardFront());
  }
  assert(wrappedBuffer.empty());
  std::cout << "OK: wraparound conserva el orden FIFO" << std::endl;

  ReadingBuffer<4> forwardingBuffer;
  assert(forwardingBuffer.push(entry(1)));
  assert(forwardingBuffer.push(entry(2)));
  const size_t published = flushReadingBuffer(
      forwardingBuffer, 3, [](const ReadingBufferEntry& publishedEntry) {
        return publishedEntry.ts != 1;
      });
  assert(published == 0);
  assert(forwardingBuffer.size() == 2);
  assert(forwardingBuffer.peek(front));
  assert(front.ts == 1);
  assert(forwardingBuffer.push(entry(4)));
  assert(forwardingBuffer.size() == 3);
  assert(forwardingBuffer.peek(front));
  assert(front.ts == 1);
  assert(forwardingBuffer.discardFront());
  assert(forwardingBuffer.peek(front));
  assert(front.ts == 2);
  assert(forwardingBuffer.discardFront());
  assert(forwardingBuffer.peek(front));
  assert(front.ts == 4);
  std::cout << "OK: fallo de publish conserva la cabeza" << std::endl;
}
