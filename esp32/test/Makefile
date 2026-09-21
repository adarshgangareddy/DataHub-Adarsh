# Host-side unit tests (no ESP32 needed; only a C++ compiler):   make test
CXX ?= g++
FLAGS = -std=c++17 -Wall -Wextra -Werror

test: schedule_logic_test gate_test
	./schedule_logic_test
	./gate_test

schedule_logic_test: schedule_logic_test.cpp ../src/schedule_logic.cpp ../src/schedule_logic.h
	$(CXX) $(FLAGS) -o $@ schedule_logic_test.cpp ../src/schedule_logic.cpp

# gate.cpp is compiled unchanged against a fake motor layer and a tiny Arduino stand-in.
gate_test: gate_test.cpp ../src/gate.cpp ../src/gate.h ../src/config.h
	$(CXX) $(FLAGS) -Ihost_stubs -o $@ gate_test.cpp ../src/gate.cpp

clean:
	rm -f schedule_logic_test gate_test
